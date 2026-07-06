import javascriptLogo from './javascript.svg'
import viteLogo from '/vite.svg'
import { setupCounter } from './counter.js'
import './style.scss';
import '@carbon/web-components/es/components/button/button.js';
import '@carbon/web-components/es/components/ui-shell/index';


document.querySelector('#app').innerHTML = `
  <div>
    <a href="https://vitejs.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" target="_blank">
      <img src="${javascriptLogo}" class="logo vanilla" alt="JavaScript logo" />
    </a>
    <h1>Hello Vite!</h1>
    <div class="card">
      <button id="counter" type="button"></button>
    </div>
    <p class="read-the-docs">
      Click on the Vite logo to learn more
    </p>
  </div>
`

const bodyEl = document.querySelector('body');

// button click handler
const handleClick = () => {
  bodyEl.classList.toggle('g10');
  bodyEl.classList.toggle('g100');
};
document.querySelector('.button').addEventListener('click', handleClick);

// set initial theme based on preferences
if (matchMedia('prefers-color-scheme').matches) {
  bodyEl.classList.add('g100');
} else {
  bodyEl.classList.add('g10');
}


setupCounter(document.querySelector('#counter'))
