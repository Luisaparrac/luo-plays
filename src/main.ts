import { App } from './App';
import './styles/main.css';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app element');
}

void new App(root).start();
