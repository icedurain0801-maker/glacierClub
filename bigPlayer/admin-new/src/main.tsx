import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Provider } from 'mobx-react'
import App from './App'
import { getStore } from './context'
import './styles/index.less'

const store = getStore()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Provider {...store}>
    <HashRouter>
      <App />
    </HashRouter>
  </Provider>,
)
