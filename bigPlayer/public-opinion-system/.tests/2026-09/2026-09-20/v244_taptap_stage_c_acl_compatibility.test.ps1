$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$preparer=Get-Content -Raw -LiteralPath (Join-Path $root 'scripts\windows-services\prepare-worker-preflight.ps1')
if($preparer-notmatch 'function Set-FileSystemAclCompat' -or $preparer-notmatch 'PSObject\.Methods\.Match\(''SetAccessControl''\)' -or $preparer-notmatch '\[IO\.FileSystemAclExtensions\]::SetAccessControl'){throw 'ACL writer does not select the supported runtime API by capability'}
$validator=Get-Content -Raw -LiteralPath (Join-Path $root 'scripts\windows-services\validate-artifacts.ps1')
if($validator-notmatch 'PSObject\.Methods\.Match\(''GetAccessControl''\)' -or $validator-notmatch '\[System\.IO\.FileSystemAclExtensions\]::GetAccessControl'){throw 'ACL validator does not select the supported runtime API by capability'}
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'scripts\windows-services\validate-artifacts.ps1'),[ref]$null,[ref]$null)
foreach($name in @('Get-AccessControlCompat','Assert-AllowedAcl')){
 $definition=$ast.FindAll({param($node) $node-is[System.Management.Automation.Language.FunctionDefinitionAst]-and$node.Name-eq$name},$true)|Select-Object -First 1
 if($null-eq$definition){throw "validator function missing: $name"}
 Invoke-Expression $definition.Extent.Text
}
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('po-stage-c-acl-'+[guid]::NewGuid().ToString('N'))
function New-StrictAcl([bool]$Directory,[bool]$Writable){
 $acl=if($Directory){New-Object Security.AccessControl.DirectorySecurity}else{New-Object Security.AccessControl.FileSecurity}
 $acl.SetAccessRuleProtection($true,$false)
 $inherit=if($Directory){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
 $allow=[Security.AccessControl.AccessControlType]::Allow;$current=[Security.Principal.WindowsIdentity]::GetCurrent().User
 foreach($p in @(@([Security.Principal.SecurityIdentifier]'S-1-5-18',[Security.AccessControl.FileSystemRights]::FullControl),@([Security.Principal.SecurityIdentifier]'S-1-5-32-544',[Security.AccessControl.FileSystemRights]::FullControl),@($current,[Security.AccessControl.FileSystemRights]::ReadAndExecute),@([Security.Principal.SecurityIdentifier]'S-1-5-19',$(if($Writable){[Security.AccessControl.FileSystemRights]::Modify}else{[Security.AccessControl.FileSystemRights]::ReadAndExecute})))){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($p[0],$p[1],$inherit,[Security.AccessControl.PropagationFlags]::None,$allow)))}
 return $acl
}
function Set-CompatAclRaw([IO.FileSystemInfo]$item,[Security.AccessControl.FileSystemSecurity]$acl){if(@($item.PSObject.Methods.Match('SetAccessControl')).Count-gt 0){$item.SetAccessControl($acl);return};if($item-is[IO.DirectoryInfo]){[IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]$item,[Security.AccessControl.DirectorySecurity]$acl)}else{[IO.FileSystemAclExtensions]::SetAccessControl([IO.FileInfo]$item,[Security.AccessControl.FileSecurity]$acl)}}
function Get-CompatAclRaw([IO.FileSystemInfo]$item){if(@($item.PSObject.Methods.Match('GetAccessControl')).Count-gt 0){return $item.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)};if($item-is[IO.DirectoryInfo]){return [IO.FileSystemAclExtensions]::GetAccessControl([IO.DirectoryInfo]$item,[Security.AccessControl.AccessControlSections]::Access)};return [IO.FileSystemAclExtensions]::GetAccessControl([IO.FileInfo]$item,[Security.AccessControl.AccessControlSections]::Access)}
function Set-CompatAcl([IO.FileSystemInfo]$item,[bool]$Writable){Set-CompatAclRaw $item (New-StrictAcl ($item-is[IO.DirectoryInfo]) $Writable)}
function Add-AclRule($acl,$identity,$rights,$inherit,[Security.AccessControl.AccessControlType]$type){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,$rights,$inherit,[Security.AccessControl.PropagationFlags]::None,$type)))}
function New-SplitStrictAcl([bool]$Directory,[bool]$CurrentFull){
 $acl=if($Directory){New-Object Security.AccessControl.DirectorySecurity}else{New-Object Security.AccessControl.FileSecurity};$acl.SetAccessRuleProtection($true,$false)
 $inherit=if($Directory){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None};$allow=[Security.AccessControl.AccessControlType]::Allow
 $take=[Security.AccessControl.FileSystemRights]::TakeOwnership;$full=[Int64][Security.AccessControl.FileSystemRights]::FullControl;$withoutTake=[Security.AccessControl.FileSystemRights]($full-band(-bnot[Int64]$take))
 foreach($sid in @([Security.Principal.SecurityIdentifier]'S-1-5-18',[Security.Principal.SecurityIdentifier]'S-1-5-32-544')){Add-AclRule $acl $sid $withoutTake $inherit $allow;Add-AclRule $acl $sid $take $inherit $allow}
 $current=[Security.Principal.WindowsIdentity]::GetCurrent().User;Add-AclRule $acl $current $(if($CurrentFull){[Security.AccessControl.FileSystemRights]::FullControl}else{[Security.AccessControl.FileSystemRights]::ReadAndExecute}) $inherit $allow
 Add-AclRule $acl ([Security.Principal.SecurityIdentifier]'S-1-5-19') ([Security.AccessControl.FileSystemRights]::ReadAndExecute) $inherit $allow;return $acl
}
function Assert-StrictAcl([IO.FileSystemInfo]$item,[bool]$Writable){
 $acl=Get-CompatAclRaw $item
 $allowed=@('S-1-5-18','S-1-5-19','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
 $rules=@($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))
 foreach($rule in $rules){if($rule.AccessControlType-ne[Security.AccessControl.AccessControlType]::Allow){continue};$sid=$rule.IdentityReference.Value;if($sid-notin$allowed){throw "unexpected allow ACE $sid"}}
 $local=$rules|Where-Object{$_.AccessControlType-eq[Security.AccessControl.AccessControlType]::Allow-and$_.IdentityReference.Value-eq'S-1-5-19'}|ForEach-Object{$_.FileSystemRights}|Select-Object -First 1
 if($null-eq$local){throw ('LocalService ACE missing after compatibility write: '+(($rules|ForEach-Object{"$($_.IdentityReference)=$($_.FileSystemRights)"})-join';'))}
 $expected=if($Writable){[Security.AccessControl.FileSystemRights]::Modify}else{[Security.AccessControl.FileSystemRights]::ReadAndExecute}
 if(($local-band$expected)-ne$expected){throw "LocalService permissions are weaker than required: $local"}
 $writeBits=[Security.AccessControl.FileSystemRights]::WriteData -bor [Security.AccessControl.FileSystemRights]::AppendData -bor [Security.AccessControl.FileSystemRights]::WriteAttributes -bor [Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
 if(-not$Writable-and($local-band$writeBits)){throw 'read-only ACL grants LocalService write access'}
}
try{
 New-Item -ItemType Directory -Path $fixture|Out-Null;$file=Join-Path $fixture 'candidate.xml';Set-Content -LiteralPath $file -Value '<service/>' -Encoding utf8
 $directory=Get-Item -LiteralPath $fixture -Force;$leaf=Get-Item -LiteralPath $file -Force
 Set-CompatAcl $directory $false;Set-CompatAcl $leaf $false;Assert-StrictAcl $directory $false;Assert-StrictAcl $leaf $false
 # The validator must combine split explicit allows rather than reading the
 # empty .Access collection returned by the static pwsh 7.6 reader.
 Set-CompatAclRaw $leaf (New-SplitStrictAcl $false $false);Assert-AllowedAcl -Path $leaf.FullName -Profile ReadOnly
 Set-CompatAcl $directory $true;Assert-StrictAcl $directory $true
 $weak=New-Object Security.AccessControl.FileSecurity;$weak.SetAccessRuleProtection($true,$false);$weak.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.SecurityIdentifier]'S-1-5-21-1-2-3-4',[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)));Set-CompatAclRaw $leaf $weak
 $rejected=$false;try{Assert-StrictAcl $leaf $false}catch{$rejected=$true};if(-not$rejected){throw 'weak/unauthorized ACL was accepted'}
 # Existing children receive the strict ACL as inherited ACEs.  The explicit
 # deny removes the current operator's write capabilities; it is not ignored.
 $inherited=Join-Path $fixture 'inherited';New-Item -ItemType Directory -Path $inherited|Out-Null;$inheritedLeaf=Join-Path $inherited 'candidate.json';Set-Content -LiteralPath $inheritedLeaf -Value '{}' -Encoding utf8
 $inheritedDirectory=Get-Item -LiteralPath $inherited -Force;Set-CompatAclRaw $inheritedDirectory (New-SplitStrictAcl $true $true)
 $inheritedLeafItem=Get-Item -LiteralPath $inheritedLeaf -Force;$inheritedAcl=Get-CompatAclRaw $inheritedLeafItem
 $inheritedRules=@($inheritedAcl.GetAccessRules($false,$true,[Security.Principal.SecurityIdentifier]));if($inheritedRules.Count-eq 0){throw 'fixture did not produce inherited ACEs'}
 $current=[Security.Principal.WindowsIdentity]::GetCurrent().User;$denyWrite=[Security.AccessControl.FileSystemRights]::Write-bor[Security.AccessControl.FileSystemRights]::Delete-bor[Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles-bor[Security.AccessControl.FileSystemRights]::ChangePermissions-bor[Security.AccessControl.FileSystemRights]::TakeOwnership
 Add-AclRule $inheritedAcl $current $denyWrite ([Security.AccessControl.InheritanceFlags]::None) ([Security.AccessControl.AccessControlType]::Deny);Set-CompatAclRaw $inheritedLeafItem $inheritedAcl;Assert-AllowedAcl -Path $inheritedLeaf -Profile ReadOnly
 $denySystemAcl=Get-CompatAclRaw (Get-Item -LiteralPath $inheritedLeaf -Force);Add-AclRule $denySystemAcl ([Security.Principal.SecurityIdentifier]'S-1-5-18') ([Security.AccessControl.FileSystemRights]::TakeOwnership) ([Security.AccessControl.InheritanceFlags]::None) ([Security.AccessControl.AccessControlType]::Deny);Set-CompatAclRaw (Get-Item -LiteralPath $inheritedLeaf -Force) $denySystemAcl
 $denied=$false;try{Assert-AllowedAcl -Path $inheritedLeaf -Profile ReadOnly}catch{if($_.Exception.Message-notmatch'FullControl missing for S-1-5-18'){throw};$denied=$true};if(-not$denied){throw 'SYSTEM deny ACE was ignored'}
 Write-Output "PASS: capability-selected ACL reads and writes preserve the strict Worker ACL on PowerShell $($PSVersionTable.PSVersion), and reject weak ACLs"
}finally{if(Test-Path -LiteralPath $fixture){$current=[Security.Principal.WindowsIdentity]::GetCurrent().User;$items=@((Get-Item -LiteralPath $fixture -Force))+@(Get-ChildItem -LiteralPath $fixture -Force -Recurse -ErrorAction SilentlyContinue);foreach($item in $items){$cleanupAcl=if($item-is[IO.DirectoryInfo]){New-Object Security.AccessControl.DirectorySecurity}else{New-Object Security.AccessControl.FileSecurity};$cleanupAcl.SetAccessRuleProtection($true,$false);$cleanupAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($current,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]::None,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)));Set-CompatAclRaw $item $cleanupAcl};& node.exe -e "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:3})" $fixture;if($LASTEXITCODE-ne 0){throw "ACL fixture cleanup failed: $fixture"};if(Test-Path -LiteralPath $fixture){throw "ACL fixture residue remains: $fixture"}}}
