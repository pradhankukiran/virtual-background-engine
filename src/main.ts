import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import App from './App.vue';

const app = createApp(App);

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: 'none',
    },
  },
});

app.mount('#app');

if (crossOriginIsolated) {
  console.log('[VBG] Cross-origin isolated: SharedArrayBuffer available');
} else {
  console.warn('[VBG] Not cross-origin isolated — some features may be unavailable');
}
