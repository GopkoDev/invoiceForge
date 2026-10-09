import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { theme } from 'vitepress-openapi/client';
import 'vitepress-openapi/dist/style.css';
import './custom.css';
import { setupDiagramZoom } from './diagram-zoom';

export default {
  extends: DefaultTheme,
  enhanceApp(ctx) {
    theme.enhanceApp(ctx);
    if (!import.meta.env.SSR) setupDiagramZoom();
  },
} satisfies Theme;
