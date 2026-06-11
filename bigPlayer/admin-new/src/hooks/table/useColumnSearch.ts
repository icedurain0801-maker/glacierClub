import { useState } from 'react'

function useColumnSearch<T>(key: keyof T) {
  const [searchText, setSearchText] = useState('')

  const getColumnSearchProps = () => ({
    filterDropdown: () => null,
    onFilter: (value: string, record: T) => {
      const val = record[key]
      return String(val).toLowerCase().includes(value.toLowerCase())
    },
  })

  return { searchText, setSearchText, getColumnSearchProps }
}

export { useColumnSearch };
export default useColumnSearch;
