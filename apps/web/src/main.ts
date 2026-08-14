import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/base.css';
import './styles/hljs-theme.css';
import './styles/tokens.css';

createApp(App).use(createPinia()).use(router).mount('#app');
