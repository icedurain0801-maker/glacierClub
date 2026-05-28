import { FormInstance, Modal, Tabs } from 'antd';
import React, { ReactNode, useCallback, useState } from 'react';

import { LangSelectModal } from '@/pages/club/appearance/components/Create';

import { DefaultLanguage, useBoardCreate } from '../../../context/boardCreateProvider';

interface LanguageTabWrapperProps {
    children: (lang: string) => React.ReactNode;
    modalForm: FormInstance;
    // arrName: string;
    // fieldName: string;
    selectedLanguages: string[];
    setSelectedLanguages: (val: string[]) => void;
    activeKey: string;
    setActiveKey: (val: string) => void;
    afterAddLanguage?: (lang: string) => void;
}

export function LanguageTabWrapper(props: LanguageTabWrapperProps) {
    const {
        children,
        // modalForm, arrName,
        selectedLanguages,
        setSelectedLanguages,
        activeKey,
        setActiveKey,
        afterAddLanguage,
    } = props;
    const { isEN, languageOptions, languageDict } = useBoardCreate();

    // 添加语言
    const addLanguage = useCallback(
        lang => {
            if (afterAddLanguage) {
                afterAddLanguage(lang);
            }
            setSelectedLanguages([ ...selectedLanguages, lang ]);
            setActiveKey(lang);
        },
        [ afterAddLanguage, selectedLanguages, setActiveKey, setSelectedLanguages ]
    );

    // 删除语言
    const deleteLanguage = useCallback(
        (lang: string) => {
            const nextLanguages = selectedLanguages.filter(item => item !== lang);
            setSelectedLanguages(nextLanguages);
            setActiveKey(nextLanguages[nextLanguages.length - 1] || DefaultLanguage);
        },
        [ selectedLanguages, setActiveKey, setSelectedLanguages ]
    );

    return isEN && selectedLanguages?.length ? (
        <Tabs
            activeKey={activeKey}
            onTabClick={setActiveKey}
            type="editable-card"
            addIcon={<div>+添加语种</div>}
            // 强制每个tab都渲染
            destroyInactiveTabPane={false}
            onEdit={(key, action: 'add' | 'remove') => {
                // 增加
                if (action === 'add') {
                    const ref = React.createRef<{
                        form: FormInstance;
                    }>();
                    const options = languageOptions.map(v => ({
                        ...v,
                        value: v.code,
                        disabled: selectedLanguages.includes(v.code),
                    }));
                    Modal.confirm({
                        icon: null,
                        content: <LangSelectModal options={options} ref={ref} />,
                        async onOk() {
                            const { language } = (await ref.current?.form.validateFields()) ?? {};
                            addLanguage(language);
                        },
                    });
                } else {
                    // 删除
                    deleteLanguage(key as string);
                }
            }}
        >
            {selectedLanguages.map((lang: string) => (
                <Tabs.TabPane
                    forceRender
                    closable={lang !== DefaultLanguage}
                    tab={languageDict[lang]?.label}
                    key={lang}
                >
                    {children(lang)}
                </Tabs.TabPane>
            ))}
        </Tabs>
    ) : (
        <> {children('')}</>
    );
}
