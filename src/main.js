// main.js — Application entry point.
// bootstrap() → createApp() → start()

import './styles/base.css';
import './styles/ocr.css';
import './styles/handwriting.css';
import './styles/editor.css';
import './styles/history.css';
import './styles/mobile.css';

import { bootstrap } from './core/bootstrap.js';
import { createApp, start } from './core/app.js';

bootstrap();
createApp();
start();
