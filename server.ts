import app from './app';

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`[server] Running on port ${PORT} (${process.env.NODE_ENV ?? 'development'})`);
});
