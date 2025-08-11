// ... (previous code remains the same until the menu section)

// Admin paneli
const adminMenu = Markup.inlineKeyboard([
  [Markup.button.callback('📊 Statistika', 'admin_stats')],
  [Markup.button.callback('📢 Xabar yuborish', 'admin_broadcast')],
  [Markup.button.callback('👥 Foydalanuvchilar', 'admin_users')],
  [Markup.button.callback('🔙 Asosiy menyu', 'main_menu')]
]);

// Asosiy menyu
const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('💰 Hisobim', 'menu_balance')],
  [Markup.button.callback('💵 Pul ishlash', 'menu_earn')],
  [Markup.button.callback('🎮 Free Fire', 'menu_freefire')],
  [Markup.button.callback('👑 Admin Panel', 'admin_panel')],
  [Markup.button.callback('👑 Premium & Stars', 'menu_premium')],
  [Markup.button.callback('🎮 PUBG UC/PP', 'menu_pubg')],
  [Markup.button.url('🛒 UC SHOP - Sotib Olish', 'https://t.me/suxa_cyber')],
  [Markup.button.callback('❓ Yordam', 'menu_sos')]
]);


// Free Fire Diamonds
bot.action('ff_diamonds', async (ctx) => {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('100 💎 - 15,000 so\'m', 'buy_ff_100'),
      Markup.button.callback('200 💎 - 29,000 so\'m', 'buy_ff_200')
    ],
    [
      Markup.button.callback('500 💎 - 70,000 so\'m', 'buy_ff_500'),
      Markup.button.callback('1000 💎 - 130,000 so\'m', 'buy_ff_1000')
    ],
    [
      Markup.button.callback('2000 💎 - 250,000 so\'m', 'buy_ff_2000'),
      Markup.button.callback('5000 💎 - 600,000 so\'m', 'buy_ff_5000')
    ],
    [Markup.button.callback('🔙 Orqaga', 'menu_freefire')]
  ]);
  
  await ctx.editMessageText(
    '💎 *Free Fire Diamonds*\n\n' +
    'Kerakli miqdorni tanlang:',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    }
  );
});



// Admin paneli
bot.action('admin_panel', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Sizda bunday huquq yo\'q!');
  }
  
  const sessions = JSON.parse(fs.readFileSync('sessions.json', 'utf8'));
  const userCount = Object.keys(sessions).length;
  
  await ctx.editMessageText(
    `👑 *Admin Panel*\n\n` +
    `👥 Jami foydalanuvchilar: ${userCount}\n` +
    `📊 Bot ish holati: ✅ Ishlamoqda\n\n` +
    `Kerakli bo\'limni tanlang:`, 
    {
      parse_mode: 'Markdown',
      reply_markup: adminMenu.reply_markup
    }
  );
});

// Admin statistikasi
bot.action('admin_stats', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Sizda bunday huquq yo\'q!');
  }
  
  const sessions = JSON.parse(fs.readFileSync('sessions.json', 'utf8'));
  const userCount = Object.keys(sessions).length;
  
  // Eng ko'p balansli 5 ta foydalanuvchi
  const topUsers = Object.entries(sessions)
    .sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0))
    .slice(0, 5)
    .map(([id, data], index) => {
      return `${index + 1}. ID:${id} - ${data.balance || 0} so'm`;
    })
    .join('\n');
  
  await ctx.editMessageText(
    `📊 *Bot statistikasi*\n\n` +
    `👥 Jami foydalanuvchilar: ${userCount}\n` +
    `💰 Eng ko'p balansli foydalanuvchilar:\n${topUsers || 'Ma\'lumot yo\'q'}`,
    {
      parse_mode: 'Markdown',
      reply_markup: adminMenu.reply_markup
    }
  );
});

// Xabar yuborish
bot.action('admin_broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('❌ Sizda bunday huquq yo\'q!');
  }
  
  const session = getSession(ctx.from.id);
  session.waitingForBroadcast = true;
  
  await ctx.editMessageText(
    '📢 *Xabar yuborish*\n\n' +
    'Barcha foydalanuvchilarga yubormoqchi bo\'lgan xabaringizni yuboring:',
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Orqaga', 'admin_panel')]
      ]).reply_markup
    }
  );
});

// Free Fire buyurtmalarini qo'shamiz
const ffHandlers = {
  '100': { type: 'diamonds', amount: 100, price: process.env.FF_100 },
  '200': { type: 'diamonds', amount: 200, price: process.env.FF_200 },
  '500': { type: 'diamonds', amount: 500, price: process.env.FF_500 },
  '1000': { type: 'diamonds', amount: 1000, price: process.env.FF_1000 },
  '2000': { type: 'diamonds', amount: 2000, price: process.env.FF_2000 },
  '5000': { type: 'diamonds', amount: 5000, price: process.env.FF_5000 },
  'elite': { type: 'elite', amount: 1, price: process.env.FF_ELITE, name: 'Elite Pass' },
  'elite_plus': { type: 'elite', amount: 1, price: process.env.FF_ELITE_PLUS, name: 'Elite Pass+' }
};

// Buy FF handler
bot.action(/^buy_ff_(\w+)/, async (ctx) => {
  try {
    const userId = ctx.from.id;
    const item = ffHandlers[ctx.match[1]];
    
    if (!item) {
      return ctx.answerCbQuery('❌ Noto\'g\'ri tanlov!');
    }
    
    const session = getSession(userId);
    session.waitingForCardNumber = true;
    session.pendingPurchase = {
      type: 'freefire',
      itemType: item.type,
      amount: parseInt(item.price),
      itemAmount: item.amount,
      description: item.name || `${item.amount} Diamond`,
      timestamp: Date.now()
    };
    
    // Karta raqamini so'rash
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Orqaga', 'ff_diamonds')]
    ]);
    
    await ctx.editMessageText(
      `💳 *Karta raqamingizni yuboring*\n\n` +
      `📦 Buyurtma tafsilotlari:\n` +
      `• ${item.name || item.amount + ' 💎'}\n` +
      `• Narxi: *${parseInt(item.price).toLocaleString()} so'm*\n\n` +
      `Iltimos, to'lov qiladigan karta raqamingizni yuboring:`, 
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (error) {
    console.error('Free Fire buyurtmada xatolik:', error);
    await ctx.answerCbQuery('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// ... (rest of the code remains the same)
