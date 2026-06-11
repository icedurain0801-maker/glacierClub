import { Card, Spin, Alert } from 'antd'
import { useEffect, useState } from 'react'
import { getDressUpList } from '@/api/club'

export default function ClubAppearance() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getDressUpList()
      .then((res) => {
        setData(res.data)
        setError(null)
      })
      .catch((err) => {
        setError(err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <Spin size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: 100 }} />
  }

  return (
    <div>
      <h1>Appearance (装扮)</h1>
      {error && <Alert message="Error" description={error} type="error" showIcon />}
      {!error && (
        <Card>
          <p>Successfully loaded {data.length} items</p>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </Card>
      )}
    </div>
  )
}
