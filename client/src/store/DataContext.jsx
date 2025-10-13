import { createContext, useContext, useState } from 'react'

const DataCtx = createContext(null)

export function DataProvider({ children }) {
  const [analysis, setAnalysis] = useState(null) // guarda o JSON da API
  return (
    <DataCtx.Provider value={{ analysis, setAnalysis }}>
      {children}
    </DataCtx.Provider>
  )
}

export const useAnalysis = () => useContext(DataCtx)
