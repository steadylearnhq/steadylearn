/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import './lib/auth'
import App from './App.tsx'

const root = document.getElementById('root')

render(() => <App />, root!)
