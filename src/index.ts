import { Hono } from 'hono';
import tradesRouter from './routes/trades';
import userStatsRouter from './routes/users';
import whaleRouter from './routes/whales';
import hfRouter from './routes/highfrequencys';
const app = new Hono();

app.route('/api/trades', tradesRouter);
app.route('/api/users', userStatsRouter);
app.route('/api/whales', whaleRouter);
app.route('/api/highfrequencys', hfRouter);

app.get('/', (c) => c.text('PiperX API is running 🚀'));


export default {
  fetch: app.fetch
};
