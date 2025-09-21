import { Hono } from 'hono';
import tradesRouter from './routes/trades';
import userStatsRouter from './routes/users';

const app = new Hono();

app.route('/api/trades', tradesRouter);
app.route('/api/users', userStatsRouter);

app.get('/', (c) => c.text('PiperX API is running 🚀'));


export default {
  fetch: app.fetch
};
