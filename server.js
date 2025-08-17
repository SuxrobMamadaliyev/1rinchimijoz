require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// Require the bot instance (bot_new.js exports the bot)
const bot = require('./bot_new');

const app = express();
app.use(express.json());

// Basic health and root endpoints for Render
app.get('/', (req, res) => {
  res.send('Bot server is running');
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// Optionally serve a static index.html if present (non-fatal if missing)
const indexPath = path.join(__dirname, 'index.html');
app.get('/index.html', (req, res, next) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

// Webhook endpoint for Telegram (optional; enabled when WEBHOOK_URL or RENDER_EXTERNAL_URL is set)
const WEBHOOK_PATH = '/webhook';
app.post(WEBHOOK_PATH, bot.webhookCallback(WEBHOOK_PATH));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`HTTP server listening on port ${PORT}`);

  try {
    const baseUrl = process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL;
    if (baseUrl) {
      const fullWebhookUrl = `${baseUrl.replace(/\/$/, '')}${WEBHOOK_PATH}`;
      await bot.telegram.setWebhook(fullWebhookUrl);
      console.log(`Webhook set to: ${fullWebhookUrl}`);
    } else {
      console.log('No WEBHOOK_URL/RENDER_EXTERNAL_URL provided. Running in polling mode.');
    }
  } catch (err) {
    console.error('Failed to set webhook:', err);
  }
});
