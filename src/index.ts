import { Hono } from 'hono';
import tradesRouter from './routes/trades';

const app = new Hono();

app.route('/api/trades', tradesRouter);

app.get('/', (c) => c.text('PiperX API is running 🚀'));


export default {
  fetch: app.fetch
};
