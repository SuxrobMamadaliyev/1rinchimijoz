const { Telegraf, Markup, session } = require('telegraf');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Rate limiting
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 2000; // 2 seconds
const RATE_LIMIT_MAX = 3; // Max messages per window

// Function to check rate limit
function checkRateLimit(userId) {
  const now = Date.now();
  const userTimestamps = rateLimit.get(userId) || [];
  
  // Remove timestamps older than the current window
  const recentTimestamps = userTimestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  // Check if user is over the limit
  if (recentTimestamps.length >= RATE_LIMIT_MAX) {
    return false; // Rate limited
  }
  
  // Add current timestamp and update the map
  recentTimestamps.push(now);
  rateLimit.set(userId, recentTimestamps);
  return true; // Not rate limited
}

// Function to escape MarkdownV2 special characters
function escapeMarkdownV2(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-={}.!]/g, '\\$&');
}

// Define the path to the menu image
const MENU_IMAGE = path.join(__dirname, 'menu.jpg');

// Botni yaratamiz
const bot = new Telegraf(process.env.BOT_TOKEN);

// Middleware to check rate limit and channel subscription
bot.use(async (ctx, next) => {
  try {
    // Skip if it's not a message or doesn't have a user ID
    if (!ctx.message || !ctx.from) return next();
    
    const userId = ctx.from.id;
    
    // Check rate limit
    if (!checkRateLimit(userId)) {
      console.log(`Rate limit exceeded for user ${userId}`);
      return; // Skip processing this message
    }
    
    // List of required channels (add your channel usernames here)
    const requiredChannels = ['HOLYUCSERVIS', 'starschatim'];
    
    // Check channel subscription
    for (const channel of requiredChannels) {
      try {
        const member = await ctx.telegram.getChatMember(`@${channel}`, userId);
        if (member.status === 'left' || member.status === 'kicked') {
          console.log(`User ${userId} is not subscribed to @${channel}`);
          await ctx.reply(`Iltimos, avval @${channel} kanaliga obuna bo'ling !`);
          return; // Skip processing if not subscribed
        }
      } catch (error) {
        console.error(`Error checking subscription to @${channel}:`, error);
      }
    }
    
    // Continue to the next middleware/handler
    return next();
  } catch (error) {
    console.error('Middleware error:', error);
    return next(); // Continue to next middleware even if there's an error
  }
});

// Global variables for user data
if (!global.referrals) {
  global.referrals = {}; // Store referral data
}
if (!global.existingUsers) {
  global.existingUsers = new Set(); // Track existing users
}

// Foydalanuvchilar ma'lumotlarini yuklash
function loadUsers() {
  try {
    if (fs.existsSync('users.json')) {
      const data = fs.readFileSync('users.json', 'utf8');
      const users = JSON.parse(data || '{}');
      console.log(`Loaded ${Object.keys(users).length} users`);
      return users;
    }
    return {};
  } catch (error) {
    console.error('Error loading users:', error);
    return {};
  }
}

// Foydalanuvchilar ma'lumotlarini saqlash
function saveUsers(users) {
  try {
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

// Foydalanuvchi ma'lumotlarini saqlash funksiyasi
function saveUserInfo(userData) {
  try {
    const userId = userData.id.toString();
    
    if (!users[userId]) {
      users[userId] = {
        id: userData.id,
        username: userData.username || '',
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        language_code: userData.language_code || '',
        is_bot: userData.is_bot || false,
        join_date: new Date().toISOString(),
        balance: 0, // Yangi foydalanuvchiga 0 balans
        last_updated: new Date().toISOString()
      };
    } else {
      // Faqat o'zgarishi mumkin bo'lgan ma'lumotlarni yangilaymiz
      users[userId].username = userData.username || users[userId].username || '';
      users[userId].first_name = userData.first_name || users[userId].first_name || '';
      users[userId].last_name = userData.last_name || users[userId].last_name || '';
      users[userId].language_code = userData.language_code || users[userId].language_code || '';
      users[userId].last_seen = new Date().toISOString();
      
      // Agar balans mavjud bo'lmasa, 0 qilib qo'yamiz
      if (typeof users[userId].balance === 'undefined') {
        users[userId].balance = 0;
      }
    }
    
    // Har safar faylga yozamiz
    saveUsers(users);
    
    return users[userId];
  } catch (error) {
    console.error('Error saving user info:', error);
    return null;
  }
}

// Dastur ishga tushganda foydalanuvchilarni yuklash
const users = loadUsers();

// Har 1 daqiqada foydalanuvchilarni saqlash
setInterval(() => {
  try {
    const currentUsers = loadUsers();
    // Faqat yangi o'zgarishlarni saqlash
    saveUsers({...currentUsers, ...users});
  } catch (error) {
    console.error('Error in auto-save:', error);
  }
}, 60 * 1000);

// Dastur to'xtatilganda foydalanuvchilarni saqlash
process.on('SIGINT', () => {
  saveUsers(users);
  process.exit();
});

// Start komandasi
bot.start(async (ctx) => {
  try {
    // Foydalanuvchi ma'lumotlarini saqlash
    saveUserInfo(ctx.from);
    
    // Referral link orqali kelgan bo'lsa, uni qayta ishlash
    await handleReferral(ctx);
    
    // Asosiy menyuni ko'rsatish
    await sendMainMenu(ctx);
  } catch (error) {
    console.error('Start command error:', error);
    await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Referral bonus amount
const REFERRAL_BONUS = 100; // 100 so'm for each successful referral

// --- Almaz narxlari (asosiy + bonus) ---
const ALMAZ_PRICES = {
  '100+80': 14000,       // 100 + 80 diamantes
  '310+249': 41000,      // 310 + 249 diamantes
  '520+416': 72000,      // 520 + 416 diamantes
  '1060+848': 144000,    // 1060 + 848 diamantes
  '2180+1853': 274000,   // 2180 + 1853 diamantes
  '5600+4760': 719000    // 5600 + 4760 diamantes
};

// --- PUBG Mobile UC narxlari (kengaytirilgan) ---
const UC_PRICES = {
  '60': 12000,
  '120': 24000,
  '180': 36000,
  '325': 58000,
  '385': 70000,
  '445': 82000,
  '660': 114000,
  '720': 125000,
  '985': 170000,
  '1320': 228000,
  '1800': 285000,
  '2125': 345000,
  '2460': 400000,
  '2785': 460000,
  '3850': 555000,
  '4175': 610000,
  '4510': 670000,
  '5650': 855000,
  '8100': 1100000,
  '9900': 1385000,
  '11950': 1660000,
  '16200': 2200000
};

// --- PUBG Mobile PP narxlari (kengaytirilgan) ---
const PP_PRICES = {
  '1000': 2520,
  '3000': 7560,
  '5000': 12600,
  '10000': 25200,
  '20000': 50400,
  '50000': 116676,
  '100000': 235242
};

// Session middleware barcha sozlamalar uchun
bot.use(session({
  defaultSession: () => ({
    // Almaz sotib olish uchun
    almax: { step: null, amount: null },
    // Balans to'ldirish uchun
    topup: { step: null, amount: null },
    // Buyurtma uchun
    buying: null,
    // Promokodlar uchun
    awaitingPromo: false,
    awaitingNewPromo: false,
    awaitingFindUser: false,
    awaitingBroadcast: false
  })
}));

// --- Almaz sotib olish bosqichlari ---
bot.action('buy:almaz', async (ctx) => {
  ctx.session.almaz = { step: 'amount' };
  
  // Create buttons for each diamond package
  const keyboard = [];
  
  // Add buttons for each diamond package in ALMAZ_PRICES
  for (const [packageName, price] of Object.entries(ALMAZ_PRICES)) {
    keyboard.push([
      Markup.button.callback(
        `${packageName} Almaz - ${price.toLocaleString()} so'm`,
        `almaz:amount:${packageName}`
      )
    ]);
  }
  
  // Add back button
  keyboard.push([Markup.button.callback('⬅️ Orqaga', 'back:main')]);
  
  await sendOrUpdateMenu(ctx, 'Qancha Almaz sotib olmoqchisiz?', keyboard);
});

bot.action(/almaz:amount:(.+)/, async (ctx) => {
  const packageName = ctx.match[1];
  const userId = ctx.from.id;
  const price = ALMAZ_PRICES[packageName];
  
  if (!price) {
    await ctx.answerCbQuery('❌ Xatolik: Bunday paket topilmadi');
    return;
  }
  
  const userBalance = getUserBalance(userId);
  if (userBalance < price) {
    await sendOrUpdateMenu(
      ctx,
      `❌ Mablag' yetarli emas!\n\n💳 Balans: ${userBalance.toLocaleString()} so'm\n💰 Kerak: ${price.toLocaleString()} so'm\n\nBalansingizni to'ldiring va qayta urinib ko'ring.`,
      [
        [Markup.button.callback('💳 Balansni to\'ldirish', 'topup:amount')],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ]
    );
    delete ctx.session.almaz;
    return;
  }
  ctx.session.almaz = { step: 'uid', amount };
  await sendOrUpdateMenu(ctx, `Free Fire ID raqamingizni kiriting:\n\nMasalan: 123456789`, [
    [Markup.button.callback('⬅️ Orqaga', 'back:main')]
  ]);
});

// UID va balans tekshirish
bot.on('text', async (ctx, next) => {
  if (ctx.session.almaz && ctx.session.almaz.step === 'uid') {
    const uid = ctx.message.text.trim();
    const amount = ctx.session.almaz.amount;
    const price = ALMAZ_PRICES[amount];
    const userId = ctx.from.id;
    if (!/^[0-9]{5,}$/.test(uid)) {
      await ctx.reply('❌ Iltimos, to\'g\'ri Free Fire ID raqamini kiriting!');
      return;
    }
    // Adminlarga buyurtma yuborish
    const orderId = generateOrderId();
    ctx.session.almaz = undefined;
    pendingOrders[orderId] = { userId, type: 'almaz', amount, uid, price };
    const adminMessage = `💎 *Yangi Almaz buyurtma*\n` +
      `🆔 Buyurtma ID: ${orderId}\n` +
      `💎 Miqdor: ${amount} Almaz\n` +
      `🎮 UID: ${uid}\n` +
      `💰 Summa: ${price.toLocaleString()} so'm\n` +
      `👤 Foydalanuvchi: ${ctx.from.username || ctx.from.first_name || userId} (ID: ${userId})`;
    const adminKeyboard = [
      [
        Markup.button.callback('✅ Tasdiqlash', `confirm_almaz:${orderId}`),
        Markup.button.callback('❌ Bekor qilish', `cancel_order:${orderId}`)
      ]
    ];
    for (const adminId of ADMIN_IDS) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          adminMessage,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: adminKeyboard } }
        );
      } catch (e) {}
    }
    await ctx.reply(`✅ Buyurtmangiz qabul qilindi!\n\n💎 Miqdor: ${amount} Almaz\n🎮 UID: ${uid}\n💰 Summa: ${price.toLocaleString()} so'm\n\nTez orada admin tasdiqlaydi.`);
    return;
  }
  return next();
});

// Admin tasdiqlasa balansdan pul yechish
bot.action(/confirm_almaz:(\w+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }
  const orderId = ctx.match[1];
  const order = pendingOrders[orderId];
  if (!order || order.type !== 'almaz') {
    await ctx.answerCbQuery('Buyurtma topilmadi!');
    return;
  }
  const { userId, amount, uid, price } = order;
  const userBalance = getUserBalance(userId);
  if (userBalance < price) {
    await ctx.reply(`❌ Foydalanuvchida yetarli mablag' yo'q. Balans: ${userBalance.toLocaleString()} so'm, kerak: ${price.toLocaleString()} so'm`);
    return;
  }
  updateUserBalance(userId, -price);
  delete pendingOrders[orderId];
  await ctx.answerCbQuery('✅ Buyurtma tasdiqlandi!');
  await ctx.editMessageText(`${ctx.update.callback_query.message.text}\n\n✅ *Tasdiqlandi*`);
  try {
    await ctx.telegram.sendMessage(
      userId,
      `✅ Buyurtmangiz tasdiqlandi!\n\n💎 ${amount} Almaz tez orada UID: ${uid} ga tushiriladi.`
    );
  } catch (e) {}
});

// Kanal ma'lumotlari
const CHANNELS = [
  {
    username: process.env.CHANNEL_1_USERNAME?.replace('@', '') || 'channel1', // @ belgisini olib tashlaymiz
    link: process.env.CHANNEL_1_LINK || 'https://t.me/channel1'
  },
  {
    username: process.env.CHANNEL_2_USERNAME?.replace('@', '') || 'channel2', // @ belgisini olib tashlaymiz
    link: process.env.CHANNEL_2_LINK || 'https://t.me/channel2'
  }
];

// Xabarlarni boshqarish uchun asosiy funksiya
async function sendOrUpdateMenu(ctx, caption, keyboard) {
  const greeting = `Assalomu alaykum, ${ctx.from?.first_name || 'foydalanuvchi'}!\n\n`;
  
  try {
    // Loading animatsiyasini to'xtatish
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery();
      } catch (e) {
        console.log('answerCbQuery xatoligi:', e.message);
      }
      
      // Agar asosiy menyu bo'lsa
      if (caption === 'Bo\'limni tanlang:') {
        try {
          // Avvalgi xabarni o'chirishga harakat qilamiz
          try {
            await ctx.deleteMessage();
          } catch (e) {
            console.log('Xabarni o\'chirib bo\'lmadi, yangi xabar yuborilmoqda...');
          }
          
          // Rasm bilan yangi xabar yuborishga harakat qilamiz
          try {
            // Convert to absolute path
            const absolutePath = path.resolve(MENU_IMAGE);
            console.log('Trying to send image from:', absolutePath);
            
            // Check if file exists
            if (!fs.existsSync(absolutePath)) {
              console.error('Rasm fayli topilmadi:', absolutePath);
              throw new Error(`Rasm fayli topilmadi: ${absolutePath}`);
            }
            
            console.log('Rasm fayli mavjud, yuborilmoqda...');
            
            // Send photo with direct file path
            try {
              console.log('Attempting to send photo...');
              await ctx.replyWithPhoto(
                { source: fs.createReadStream(absolutePath) },
                {
                  caption: greeting + caption,
                  ...Markup.inlineKeyboard(keyboard),
                  parse_mode: 'Markdown'
                }
              );
              console.log('Rasm muvaffaqiyatli yuborildi');
              return;
            } catch (sendError) {
              console.error('Error sending photo:', sendError);
              console.error('Error details:', {
                message: sendError.message,
                stack: sendError.stack,
                response: sendError.response?.data || 'No response data'
              });
              throw sendError; // Re-throw to be caught by the outer catch
            }
          } catch (photoError) {
            console.error('Rasm bilan xabar yuborishda xatolik:', photoError);
            // Rasm bilan yuborib bo'lmasa, oddiy xabar sifatida yuborishga harakat qilamiz
            await ctx.reply(greeting + caption, {
              ...Markup.inlineKeyboard(keyboard),
              parse_mode: 'Markdown'
            });
          }
        } catch (error) {
          console.error('Asosiy menyu yuborishda xatolik:', error);
          // Xatolik yuz bersa, oddiy xabar sifatida yuborishga harakat qilamiz
          try {
            await ctx.reply(greeting + caption, {
              ...Markup.inlineKeyboard(keyboard),
              parse_mode: 'Markdown'
            });
          } catch (e) {
            console.error('Alternativ xabar yuborishda xatolik:', e);
          }
        }
      } else {
        // Try to handle message editing or sending new message
        const message = ctx.callbackQuery?.message;
        const messageId = message?.message_id;
        const chatId = ctx.chat?.id || message?.chat?.id;
        
        // Check if we can edit this message (it must have text and be in a chat where we can edit messages)
        const canEditMessage = messageId && chatId && 
                             (message?.text || message?.caption) && 
                             !message?.photo; // Don't try to edit photo captions
        
        // First try to edit the existing message if possible
        if (canEditMessage) {
          try {
            await ctx.telegram.editMessageText(
              chatId,
              messageId,
              null, // inline_message_id
              caption,
              {
                reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
                parse_mode: 'Markdown'
              }
            );
            return; // Successfully edited, we're done
          } catch (editError) {
            console.error('Xabarni tahrirlashda xatolik:', editError.message);
            // Continue to fallback method
          }
        }
        
        // If we can't edit, try to delete the old message and send a new one
        try {
          // Try to delete the old message if it exists
          if (messageId) {
            try { 
              await ctx.telegram.deleteMessage(chatId, messageId);
            } catch (deleteError) {
              console.log('Eski xabarni o\'chirib bo\'lmadi:', deleteError.message);
              // Continue even if delete fails
            }
          }
          
          // Try to send a new message with full formatting
          try {
            await ctx.reply(caption, {
              reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
              parse_mode: 'Markdown'
            });
          } catch (replyError) {
            console.error('Formatlangan xabar yuborishda xatolik:', replyError);
            
            // If that fails, try sending just the text with keyboard
            try {
              await ctx.reply(caption, Markup.inlineKeyboard(keyboard));
            } catch (simpleError) {
              console.error('Oddiy xabar yuborishda ham xatolik:', simpleError);
              
              // Last resort: try to send just the text
              try {
                await ctx.reply(caption);
              } catch (finalError) {
                console.error('Faqat matn yuborishda ham xatolik:', finalError);
              }
            }
          }
        } catch (mainError) {
          console.error('Xabar yuborishda asosiy xatolik:', mainError);
        }
      }
    } else {
      // Yangi suhbat boshlanganda
      if (caption === 'Bo\'limni tanlang:') {
        try {
          const greeting = `Assalomu alaykum, ${ctx.from.first_name || 'foydalanuvchi'}!\n\n`;
          const absolutePath = path.resolve(MENU_IMAGE);
          console.log('Trying to send image from (second instance):', absolutePath);
          
          // Check if file exists
          if (!fs.existsSync(absolutePath)) {
            console.error('Rasm fayli topilmadi (second instance):', absolutePath);
            throw new Error(`Rasm fayli topilmadi: ${absolutePath}`);
          }
          
          console.log('Rasm fayli mavjud, yuborilmoqda (second instance)...');
          
          try {
            await ctx.replyWithPhoto(
              { source: absolutePath },
              {
                caption: greeting + caption,
                ...Markup.inlineKeyboard(keyboard),
                parse_mode: 'Markdown'
              }
            );
          } catch (error) {
            console.error('Rasm yuborishda xatolik (second instance):', error);
            throw error; // Re-throw to be caught by the outer catch block
          }
        } catch (error) {
          console.error('Rasm yuklanmadi:', error);
          await ctx.reply(caption, Markup.inlineKeyboard(keyboard));
        }
      } else {
        await ctx.reply(caption, Markup.inlineKeyboard(keyboard));
      }
    }
  } catch (error) {
    console.error('Xatolik yuz berdi:', error);
    try {
      // Last resort: try to send a simple message
      await ctx.reply(caption);
    } catch (e) {
      console.error('Xabar yuborib bo\'lmadi:', e);
    }
  }
} // End of sendOrUpdateMenu function

// Asosiy menyuda ko'rinadigan tugmalar nomlari
const MAIN_MENU = [
  'Hisobim',
  'TG Premium & Stars',
  'PUBG Mobile UC / PP',
  'UC Shop',
  'SOS',
  'Promokod',
  'Admen paneli',
];

// User balances and referral system are now initialized at the top of the file

// /start yoki asosiy menyu ko'rsatish
async function sendMainMenu(ctx) {
  // Asosiy menyu tugmalarini yaratamiz
  try {
    // Avval obunani tekshirish
    const checkResult = await checkUserSubscription(ctx);
    
    // Agar obuna bo'lmagan bo'lsa yoki bot kanalga kira olmasa, obuna bo'lish sahifasiga yo'naltiramiz
    if (!checkResult.subscribed || checkResult.hasAccessError) {
      return await sendSubscriptionMessage(ctx, checkResult);
    }
    
    // Agar obuna bo'lgan bo'lsa, asosiy menyuni ko'rsatamiz
    const menuItems = [...MAIN_MENU]; // Asl massivni o'zgartirmaslik uchun nusxalaymiz
  
    // Admin panelini faqat adminlar uchun ko'rsatamiz
    if (!isAdmin(ctx)) {
      const adminIndex = menuItems.indexOf('Admen paneli');
      if (adminIndex > -1) {
        menuItems.splice(adminIndex, 1);
      }
    }
    
    const keyboard = menuItems.map((text) => {
      if (text === 'UC Shop') {
        return [Markup.button.url(text, UC_CHANNEL_URL)];
      }
      return [Markup.button.callback(text, `menu:${text}`)];
    });
    
    // Agar obuna bo'lmagan bo'lsa, tekshirish tugmasini qo'shamiz
    if (!checkResult.subscribed) {
      keyboard.push([Markup.button.callback('✅ Obunani tekshirish', 'check_subscription')]);
    }
    
    // Always send a new message instead of editing to avoid message editing issues
    try {
      // Try to delete any existing message first
      try {
        if (ctx.callbackQuery) {
          await ctx.deleteMessage();
        }
      } catch (e) {
        // Ignore if we can't delete the old message
      }
      
      // Send menu image with the main menu
      try {
        await ctx.replyWithPhoto({
          source: fs.createReadStream(MENU_IMAGE)
        }, {
          caption: 'Bo\'limni tanlang:',
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'Markdown'
        });
      } catch (photoError) {
        console.error('Rasm yuborishda xatolik:', photoError);
        // If image sending fails, send text menu as fallback
        await ctx.reply('Bo\'limni tanlang:', {
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'Markdown'
        });
      }
    } catch (error) {
      console.error('Error sending main menu:', error);
      // Fallback to a simple message if there's an error
      await ctx.reply('Iltimos, asosiy menyuni qayta yuklash uchun /start buyrug\'ini bosing.');
    }
  } catch (error) {
    console.error('sendMainMenu xatosi:', error);
    await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
};



bot.start((ctx) => {
  try {
    // Add user to our tracking set
    if (ctx.from && ctx.from.id) {
      global.botUsers.add(ctx.from.id);
      // Save user information
      saveUserInfo(ctx.from);
    }
    
    // Handle referral link if present
    handleReferral(ctx);
    
    // Show main menu
    sendMainMenu(ctx);
  } catch (error) {
    console.error('Error in start command:', error);
    ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Inline tugma bosilganda
bot.action(/menu:(.+)/, async (ctx) => {
  const selection = ctx.match[1];

  switch (selection) {
    case 'Pul ishlash': {
      await ctx.answerCbQuery();
      // Referral link and stats
      const userId = ctx.from.id;
      const username = ctx.from.username || ctx.from.first_name || 'foydalanuvchi';
      // Hardcode bot username for short referral link
      const referralLink = `https://t.me/Group_Guard_xizmat_Bot?start=ref${userId}`;
      
      // Since we're not tracking referrals anymore, we'll show 0
      // In a real implementation, you might want to track this in users.json
      const referralCount = 0;
      
      const totalEarned = referralCount * REFERRAL_BONUS;
      const message = `💰 *Pul ishlash* 💰\n\n` +
        `🔗 Sizning referal havolangiz:\n\`${referralLink}\`\n\n` +
        `👥 Sizning takliflaringiz: *${referralCount} ta*\n` +
        `💵 Jami ishlagan pulingiz: *${totalEarned} so'm*\n\n` +
        `📢 Do'stlaringizni taklif qiling va har bir taklif uchun *${REFERRAL_BONUS} so'm* oling!\n` +
        `Ular ham siz kabi pul ishlashni boshlaydilar!`;
      const keyboard = [
        [Markup.button.switchToChat('📤 Do\'stlarni taklif qilish', referralLink)],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ];
      await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) });
      break;
    }

    case 'Hisobim':
      await sendAccountMenu(ctx);
      break;
    case 'TG Premium & Stars':
      // Avval asosiy menyuni ko'rsatamiz
      const mainKeyboard = [
        [Markup.button.callback('📱 Telegram Premium', 'premium:select')],
        [Markup.button.callback('⭐ Telegram Stars', 'stars:select')],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ];
      await sendOrUpdateMenu(ctx, 'Qaysi xizmatni sotib olmoqchisiz?', mainKeyboard);
      break;
    case 'Free Fire Almaz': {
      await ctx.answerCbQuery();
      const price100 = ALMAZ_PRICES[100]?.toLocaleString() || 'Nomaʼlum';
      const keyboard = [
        [Markup.button.callback(`💎 Almaz sotib olish (100 Almaz - ${price100} so'm)`, 'buy:almaz')],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ];
      await sendOrUpdateMenu(ctx, "💎 Almaz sotib olish bo'limi:", keyboard);
      break;
    }
    case 'PUBG Mobile UC / PP': {
      await ctx.answerCbQuery();
      const keyboard = [
        [Markup.button.callback('UC sotib olish', 'pubg:buy_uc')],
        [Markup.button.callback('PP sotib olish', 'pubg:buy_pp')],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ];
      await sendOrUpdateMenu(ctx, "PUBG Mobile UC / PP bo'limi:", keyboard);
      break;
    }
    case 'UC Shop':
      await sendUCShop(ctx);
      break;
    case 'SOS':
      await sendSOS(ctx);
      break;
    case 'Promokod':
      await promptPromokod(ctx);
      break;
    case 'Admen paneli':
      if (isAdmin(ctx)) {
        await sendAdminPanel(ctx);
      } else {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
      }
      break;
    default:
      await ctx.answerCbQuery('Ushbu bo\'lim hozircha mavjud emas');
  }
});

// PUBG Mobile UC sotib olish bosqichi
bot.action('pubg:buy_uc', async (ctx) => {
  await sendUcMenu(ctx);
});

// PUBG Mobile PP sotib olish bosqichi
bot.action('pubg:buy_pp', async (ctx) => {
  await sendPpMenu(ctx);
});

// UC paketini tanlash
bot.action(/pubg:uc:(\d+):(\d+)/, async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userBalance = getUserBalance(userId);
    const amount = ctx.match[1];
    const price = parseInt(ctx.match[2]);
    
    // Check if user still has enough balance
    if (userBalance < price) {
      const neededAmount = price - userBalance;
      const minUcPrice = Math.min(...Object.values(UC_PRICES));
      
      const keyboard = [
        [Markup.button.callback('💳 Hisobni to\'ldirish', 'topup:amount')],
        [Markup.button.callback('⬅️ Orqaga', 'back:pubg')]
      ];
      
      return sendOrUpdateMenu(
        ctx,
        `⚠️ *Hisobingizda yetarli mablag' mavjud emas!*\n\n` +
        `💳 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n` +
        `💰 Tanlangan paket narxi: *${price.toLocaleString()} so'm*\n` +
        `💵 Yetishmayotgan summa: *${neededAmount.toLocaleString()} so'm*\n\n` +
        `ℹ Eng arzon UC paketi: *${minUcPrice.toLocaleString()} so'm*\n` +
        `💡 Iltimos, hisobingizni to'ldiring yoki kichikroq miqdor tanlang.`,
        keyboard
      );
    }
    
    // If balance is sufficient, proceed with purchase
    ctx.session.buying = { type: 'pubg_uc', amount, price };
    
    await sendOrUpdateMenu(
      ctx,
      `💎 *${amount} UC* sotib olish uchun o'yindagi foydalanuvchi nomingizni yuboring:\n\n` +
      `💳 To'lov miqdori: *${price.toLocaleString()} so'm*\n` +
      `💰 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n` +
      `📦 Miqdor: *${amount} UC*\n\n` +
      `ℹ Iltimos, o'yindagi to'liq foydalanuvchi nomingizni yozing.`,
      [[Markup.button.callback('⬅️ Orqaga', 'pubg:buy_uc')]]
    );
  } catch (error) {
    console.error('UC paketini tanlashda xatolik:', error);
    await ctx.reply('⚠️ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
    return sendPubgMenu(ctx);
  }
});

// PP paketini tanlash
bot.action(/pubg:pp:(\d+):(\d+)/, async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userBalance = getUserBalance(userId);
    const amount = ctx.match[1];
    const price = parseInt(ctx.match[2]);
    
    // Check if user still has enough balance
    if (userBalance < price) {
      const neededAmount = price - userBalance;
      const minPpPrice = Math.min(...Object.values(PP_PRICES));
      
      const keyboard = [
        [Markup.button.callback('💳 Hisobni to\'ldirish', 'topup:amount')],
        [Markup.button.callback('⬅️ Orqaga', 'back:pubg')]
      ];
      
      return sendOrUpdateMenu(
        ctx,
        `⚠️ *Hisobingizda yetarli mablag' mavjud emas!*\n\n` +
        `💳 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n` +
        `💰 Tanlangan paket narxi: *${price.toLocaleString()} so'm*\n` +
        `💵 Yetishmayotgan summa: *${neededAmount.toLocaleString()} so'm*\n\n` +
        `ℹ Eng arzon PP paketi: *${minPpPrice.toLocaleString()} so'm*\n` +
        `💡 Iltimos, hisobingizni to'ldiring yoki kichikroq miqdor tanlang.`,
        keyboard
      );
    }
    
    // If balance is sufficient, proceed with purchase
    ctx.session.buying = { type: 'pubg_pp', amount, price };
    
    await sendOrUpdateMenu(
      ctx,
      `⭐ *${amount} PP* sotib olish uchun o'yindagi foydalanuvchi nomingizni yuboring:\n\n` +
      `💳 To'lov miqdori: *${price.toLocaleString()} so'm*\n` +
      `💰 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n` +
      `📦 Miqdor: *${amount} PP*\n\n` +
      `ℹ Iltimos, o'yindagi to'liq foydalanuvchi nomingizni yozing.`,
      [[Markup.button.callback('⬅️ Orqaga', 'pubg:buy_pp')]]
    );
  } catch (error) {
    console.error('PP paketini tanlashda xatolik:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Add channel flow
bot.action('admin:addChannel', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }
  
  if (!ctx.session) ctx.session = {};
  ctx.session.channelAction = 'add';
  
  await ctx.editMessageText(
    '📢 *Yangi kanal qo\'shish*\n\n' +
    'Kanal username va linkini quyidagi formatda yuboring:\n' +
    '`@kanal_username https://t.me/kanal_link`\n\n' +
    'Misol uchun:\n' +
    '`@mychannel https://t.me/mychannel`\n\n' +
    '❕ *Eslatma:* Kanal usernamesi @ bilan boshlanishi kerak!',
    {
      reply_markup: {
        inline_keyboard: [
          [Markup.button.callback('◀️ Orqaga', 'admin:channelMenu')]
        ]
      },
      parse_mode: 'Markdown'
    }
  );
});


function sendPubgMenu(ctx) {
  const keyboard = [
    [Markup.button.callback('💎 UC Sotib Olish', 'pubg:buy_uc')],
    [Markup.button.callback('⭐ PP Sotib Olish', 'pubg:buy_pp')],
    [Markup.button.callback('⬅️ Orqaga', 'back:main')]
  ];
  return sendOrUpdateMenu(ctx, '🎮 PUBG Mobile - Xizmatlar', keyboard);
}

// UC sotib olish menyusi
async function sendUcMenu(ctx, customMessage = '') {
  const userId = ctx.from.id;
  const userBalance = getUserBalance(userId);
  
  // Show all packages without balance check
  const keyboard = [];
  
  for (const [uc, price] of Object.entries(UC_PRICES)) {
    const buttonText = `${uc} UC - ${price.toLocaleString()} so'm`;
    
    keyboard.push([
      Markup.button.callback(
        buttonText,
        `pubg:uc:${uc}:${price}`
      )
    ]);
  }
  
  // Add back button
  keyboard.push([
    Markup.button.callback('⬅️ Orqaga', 'back:pubg')
  ]);
  
  // Prepare the message
  let message = `💎 UC Sotib Olish\n\n`;
  message += `💳 UC paketlaridan birini tanlang:`;
  
  return sendOrUpdateMenu(ctx, message, keyboard);
}

// PP sotib olish menyusi
async function sendPpMenu(ctx, customMessage = '') {
  const userId = ctx.from.id;
  const userBalance = getUserBalance(userId);
  
  // Show all packages without balance check
  const keyboard = [];
  
  for (const [pp, price] of Object.entries(PP_PRICES)) {
    const buttonText = `${pp} PP - ${price.toLocaleString()} so'm`;
    
    keyboard.push([
      Markup.button.callback(
        buttonText,
        `pubg:pp:${pp}:${price}`
      )
    ]);
  }
  
  // Add top-up and back buttons
  keyboard.push([
    Markup.button.callback('💳 Hisobni to\'ldirish', 'topup:amount')
  ]);
  keyboard.push([
    Markup.button.callback('⬅️ Orqaga', 'back:pubg')
  ]);
  
  // Prepare the message
  let message = `⭐ PP Sotib Olish\n\n`;
  message += `💰 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n`;
  message += `💳 PP paketlaridan birini tanlang:`;
  
  // Add custom message if provided (like insufficient balance message)
  if (customMessage) {
    message = customMessage + '\n\n' + message;
  }
  
  return sendOrUpdateMenu(ctx, message, keyboard);
}

// Premium yoki Stars tanlash
// Premium narxlarini ko'rsatamiz
bot.action('premium:select', async (ctx) => {
  const keyboard = [
    // Premium narxlari
    [Markup.button.callback(`📱 1 oy - ${PREMIUM_PRICES[1].toLocaleString()} so'm`, `buy:premium:1:${PREMIUM_PRICES[1]}`)],
    [Markup.button.callback(`📱 3 oy - ${PREMIUM_PRICES[3].toLocaleString()} so'm`, `buy:premium:3:${PREMIUM_PRICES[3]}`)],
    [Markup.button.callback(`📱 6 oy - ${PREMIUM_PRICES[6].toLocaleString()} so'm`, `buy:premium:6:${PREMIUM_PRICES[6]}`)],
    [Markup.button.callback(`📱 12 oy - ${PREMIUM_PRICES[12].toLocaleString()} so'm`, `buy:premium:12:${PREMIUM_PRICES[12]}`)],
    // Orqaga tugmasi
    [Markup.button.callback('⬅️ Orqaga', 'back:premium_stars')]
  ];
  await sendOrUpdateMenu(ctx, '📱 Telegram Premium narxlari:', keyboard);
});

// Stars narxlarini ko'rsatamiz
bot.action('stars:select', async (ctx) => {
  const keyboard = [
    // Stars narxlari
    [Markup.button.callback(`⭐ 15 Stars - ${STARS_PRICES[15].toLocaleString()} so'm`, `buy:stars:15:${STARS_PRICES[15]}`)],
    [Markup.button.callback(`⭐ 25 Stars - ${STARS_PRICES[25].toLocaleString()} so'm`, `buy:stars:25:${STARS_PRICES[25]}`)],
    [Markup.button.callback(`⭐ 50 Stars - ${STARS_PRICES[50].toLocaleString()} so'm`, `buy:stars:50:${STARS_PRICES[50]}`)],
    [Markup.button.callback(`⭐ 100 Stars - ${STARS_PRICES[100].toLocaleString()} so'm`, `buy:stars:100:${STARS_PRICES[100]}`)],
    [Markup.button.callback(`⭐ 150 Stars - ${STARS_PRICES[150].toLocaleString()} so'm`, `buy:stars:150:${STARS_PRICES[150]}`)],
    [Markup.button.callback(`⭐ 200 Stars - ${STARS_PRICES[200].toLocaleString()} so'm`, `buy:stars:200:${STARS_PRICES[200]}`)],
    [Markup.button.callback(`⭐ 300 Stars - ${STARS_PRICES[300].toLocaleString()} so'm`, `buy:stars:300:${STARS_PRICES[300]}`)],
    // Orqaga tugmasi
    [Markup.button.callback('⬅️ Orqaga', 'back:premium_stars')]
  ];
  await sendOrUpdateMenu(ctx, '⭐ Telegram Stars narxlari:', keyboard);
});

// Hisobim kichik menyusi
async function sendAccountMenu(ctx) {
  const userId = ctx.from.id;
  const balance = await getUserBalance(ctx.from.id);
  
  const keyboard = [
    [Markup.button.callback('💰 Balansni to\'ldirish', 'topup:amount')],
    [Markup.button.callback('⬅️ Orqaga', 'back:main')]
  ];
  await sendOrUpdateMenu(ctx, `💳 Balansingiz: ${balance.toLocaleString()} so'm`, keyboard);
  await ctx.answerCbQuery();
}

// --- Sozlamalar ---
const UC_CHANNEL_URL = 'https://t.me/HOLYUCSERVIS';
const ADMIN_USER = '@d1yor_salee';
const ADMIN_IDS = [process.env.ADMIN_ID1, process.env.ADMIN_ID2].filter(Boolean).map(Number); // admin ID lari

// Ensure ADMIN_IDS has valid values
if (ADMIN_IDS.length === 0) {
  console.warn('⚠️ No valid admin IDs found. Please set ADMIN_ID1 and ADMIN_ID2 in .env file');
} else {
  console.log(`✅ Admin IDs loaded: ${ADMIN_IDS.join(', ')}`);
}

// Escape special characters for MarkdownV2
function escapeMarkdown(text) {
  if (!text) return '';
  return text.toString()
    .replace(/[_*[\]()~`>#+\-={}.!]/g, '\\$&');
}

// Track all users who have started the bot
if (!global.botUsers) {
  global.botUsers = new Set();
}

// Track users who have used the bot before (for referral system)
if (!global.existingUsers) {
  global.existingUsers = new Set();
}

// Store referral bonuses (referrerId -> [referredUserIds])
if (!global.referrals) {
  global.referrals = {};
}

// Premium va Stars narxlari
const PREMIUM_PRICES = {
  1: 43000,   // 1 oy - 43,000 so'm
  3: 152000,  // 3 oy - 152,000 so'm
  6: 222000,  // 6 oy - 222,000 so'm
  12: 320000  // 12 oy - 320,000 so'm
};

const STARS_PRICES = {
  15: 3500,    // 15 stars - 3,500 so'm
  25: 6000,    // 25 stars - 6,000 so'm
  50: 12000,   // 50 stars - 12,000 so'm
  100: 22000,  // 100 stars - 22,000 so'm
  150: 31000,  // 150 stars - 31,000 so'm
  200: 43000,  // 200 stars - 43,000 so'm
  300: 63000   // 300 stars - 63,000 so'm
};

// Debug: Check if image exists on startup
try {
  console.log('Image path:', MENU_IMAGE);
  if (fs.existsSync(MENU_IMAGE)) {
    console.log('Image file exists and is accessible');
    console.log('File stats:', fs.statSync(MENU_IMAGE));
  } else {
    console.error('Image file does not exist at path:', MENU_IMAGE);
    console.log('Current working directory:', process.cwd());
    console.log('Directory contents:', fs.readdirSync(__dirname));
  }
} catch (error) {
  console.error('Error checking image file:', error);
}

// Foydalanuvchilar balansi (aslida bu ma'lumotlar bazasida saqlanishi kerak)
const userBalances = {};

// Buyurtma yaratish uchun handler
bot.action(/buy:(premium|stars):(\d+):(\d+)/, async (ctx) => {
  console.log('Purchase action triggered:', ctx.match[0]);
  const type = ctx.match[1]; // 'premium' yoki 'stars'
  const amount = parseInt(ctx.match[2]); // oylik miqdor yoki stars miqdori
  const price = parseInt(ctx.match[3]); // narx
  const userId = ctx.from.id;
  
  // Initialize session if it doesn't exist
  if (!ctx.session) {
    ctx.session = {};
    console.log('Initialized new session in purchase action');
  }
  
  // Foydalanuvchi balansini tekshirish
  const userBalance = getUserBalance(userId);
  console.log(`User balance: ${userBalance}, Purchase price: ${price}`);
  
  // Agar balans yetarli bo'lsa
  if (userBalance >= price) {
    // Sessiyada saqlaymiz
    ctx.session.purchase = { 
      type, 
      amount, 
      price,
      step: 'username' // Add step to track the purchase flow
    };
    console.log('Updated session with purchase data:', JSON.stringify(ctx.session, null, 2));
    
    // Foydalanuvchidan username so'raymiz
    await sendOrUpdateMenu(
      ctx,
      `✅ Sotib olish uchun Telegram usernamingizni kiriting:\n` +
      `📦 Mahsulot: ${type === 'premium' ? 'Telegram Premium' : 'Telegram Stars'}\n` +
      `🔢 Miqdor: ${amount} ${type === 'premium' ? 'oy' : 'stars'}\n` +
      `💰 Narxi: ${price.toLocaleString()} so'm\n\n` +
      `Iltimos, shu formatda yuboring: @username`,
      [[Markup.button.callback('❌ Bekor qilish', 'back:main')]]
    );
  } else {
    // Balans yetarli emas
    const needed = price - userBalance;
    await sendOrUpdateMenu(
      ctx,
      `❌ *Balansingizda yetarli mablag' yo'q!*\n\n` +
      `💳 Joriy balans: ${userBalance.toLocaleString()} so'm\n` +
      `💰 Kerak bo'lgan summa: ${price.toLocaleString()} so'm\n` +
      `📉 Yetishmayapti: ${needed.toLocaleString()} so'm\n\n` +
      `Iltimos, balansingizni to'ldiring va qayta urinib ko'ring.`,
      [
        [Markup.button.callback('💳 Balansni to\'ldirish', 'topup:amount')],
        [Markup.button.callback('🔄 Qayta urinish', `back:${type === 'premium' ? 'premium' : 'stars'}`)]
      ],
      { parse_mode: 'Markdown' }
    );
  }
});

// Tasdiqlash uchun buyurtmalar
const pendingOrders = {}; // { orderId: { userId, type, amount, username, price } }

// Tasodifiy buyurtma ID generatsiya qilish
function generateOrderId() {
  return Math.random().toString(36).substr(2, 9);
}

// Foydalanuvchi balansini olish
function getUserBalance(userId) {
  const user = users[userId];
  return user && typeof user.balance !== 'undefined' ? user.balance : 0;
}

// Foydalanuvchi balansini yangilash
function updateUserBalance(userId, amount) {
  if (!users[userId]) {
    users[userId] = {};
  }
  
  if (typeof users[userId].balance === 'undefined') {
    users[userId].balance = 0;
  }
  
  users[userId].balance += amount;
  users[userId].last_updated = new Date().toISOString();
  
  // Balans o'zgarganda foydalanuvchi ma'lumotlarini saqlaymiz
  saveUsers(users);
  
  return users[userId].balance;
}

// Admin order confirmation handler
bot.action(/admin_(confirm|cancel):(.+)/, async (ctx) => {
  try {
    const action = ctx.match[1]; // 'confirm' or 'cancel'
    const orderId = ctx.match[2];
    
    // Check if admin
    if (!isAdmin(ctx)) {
      await ctx.answerCbQuery('Ruxsat yo\'q!');
      return;
    }
    
    // Get the order
    if (!global.pendingOrders || !global.pendingOrders[orderId]) {
      await ctx.answerCbQuery('Buyurtma topilmadi!');
      return;
    }
    
    const order = global.pendingOrders[orderId];
    
    if (action === 'confirm') {
      // Mark order as completed
      order.status = 'completed';
      order.completedAt = new Date().toISOString();
      order.handledBy = ctx.from.id;
      
      // Notify user
      try {
        await ctx.telegram.sendMessage(
          order.userId,
          `✅ Sizning buyurtmangiz tasdiqlandi!\n\n` +
          `🆔 Buyurtma ID: ${order.id}\n` +
          `📦 Mahsulot: ${order.type === 'premium' ? `Telegram Premium ${order.amount} oy` : `${order.amount} Stars`}\n` +
          `💰 Narxi: ${order.price.toLocaleString()} so'm\n\n` +
          `📞 Aloqa: @d1yor_salee`
        );
      } catch (error) {
        console.error('Error notifying user:', error);
      }
      
      // Update the admin message
      await ctx.editMessageText(
        `✅ *Buyurtma tasdiqlandi*\n` +
        `👤 Admin: @${ctx.from.username || 'Noma\'lum'}\n` +
        `⏰ Vaqt: ${new Date().toLocaleString()}\n\n` +
        `ℹ Buyurtma ma\'lumotlari:\n` +
        `🆔 ID: ${order.id}\n` +
        `👤 Foydalanuvchi: [${order.username}](tg://user?id=${order.userId})\n` +
        `📦 Mahsulot: ${order.type === 'premium' ? `Telegram Premium ${order.amount} oy` : `${order.amount} Stars`}\n` +
        `👥 Foydalanuvchi: ${order.targetUsername}\n` +
        `💰 Narxi: ${order.price.toLocaleString()} so'm`,
        { 
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: [] } // Remove buttons
        }
      );
      
      await ctx.answerCbQuery('✅ Buyurtma tasdiqlandi!');
      
    } else if (action === 'cancel') {
      // Mark order as cancelled
      order.status = 'cancelled';
      order.cancelledAt = new Date().toISOString();
      order.handledBy = ctx.from.id;
      
      // Refund the user
      updateUserBalance(order.userId, order.price);
      
      // Notify user
      try {
        await ctx.telegram.sendMessage(
          order.userId,
          `❌ Sizning buyurtmangiz bekor qilindi.\n\n` +
          `🆔 Buyurtma ID: ${order.id}\n` +
          `💰 ${order.price.toLocaleString()} so'm hisobingizga qaytarildi.\n\n` +
          `❓ Sabab: Admin tomonidan bekor qilindi\n` +
          `📞 Aloqa: @d1yor_salee`
        );
      } catch (error) {
        console.error('Error notifying user:', error);
      }
      
      // Update the admin message
      await ctx.editMessageText(
        `❌ *Buyurtma bekor qilindi*\n` +
        `👤 Admin: @${ctx.from.username || 'Noma\'lum'}\n` +
        `⏰ Vaqt: ${new Date().toLocaleString()}\n\n` +
        `ℹ Buyurtma ma\'lumotlari:\n` +
        `🆔 ID: ${order.id}\n` +
        `👤 Foydalanuvchi: [${order.username}](tg://user?id=${order.userId})\n` +
        `📦 Mahsulot: ${order.type === 'premium' ? `Telegram Premium ${order.amount} oy` : `${order.amount} Stars`}\n` +
        `👥 Foydalanuvchi: ${order.targetUsername}\n` +
        `💰 Narxi: ${order.price.toLocaleString()} so'm`,
        { 
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: [] } // Remove buttons
        }
      );
      
      await ctx.answerCbQuery('❌ Buyurtma bekor qilindi!');
    }
    
  } catch (error) {
    console.error('Error in admin action handler:', error);
    try {
      await ctx.answerCbQuery('Xatolik yuz berdi!');
    } catch (e) {
      console.error('Error sending error message:', e);
    }
  }
});

// ---------- Pul ishlash (Earn Money) ----------
async function sendEarnMoneyMenu(ctx) {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'foydalanuvchi';
    
    // Hardcode bot username for short referral link
    const referralLink = `https://t.me/Tekin_akkaunt_ol_bot?start=ref${userId}`;
    
    // Get referral stats
    const referralCount = referrals[userId] ? referrals[userId].length : 0;
    const totalEarned = referralCount * REFERRAL_BONUS;
    
    const message = `💰 *Pul ishlash* 💰\n\n` +
      `🔗 Sizning referal havolangiz:\n\`${referralLink}\`\n\n` +
      `👥 Sizning takliflaringiz: *${referralCount} ta*\n` +
      `💵 Jami ishlagan pulingiz: *${totalEarned} so'm*\n\n` +
      `📢 Do'stlaringizni taklif qiling va har bir taklif uchun *${REFERRAL_BONUS} so'm* oling!\n` +
      `Ular ham siz kabi pul ishlashni boshlaydilar!`;
    
    const keyboard = [
      [Markup.button.switchToChat('📤 Do\'stlarni taklif qilish', '')],
      [Markup.button.callback('🔄 Referal havolani yangilash', 'refresh_referral')],
      [Markup.button.callback('⬅️ Orqaga', 'back:main')]
    ];
    
    // Try to edit the message, if that fails, send a new one
    try {
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(keyboard)
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(keyboard)
        });
      }
    } catch (error) {
      console.error('Error editing/sending message:', error);
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(keyboard)
      });
    }
  } catch (error) {
    console.error('Error in sendEarnMoneyMenu:', error);
    await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Orqaga', 'back:main')]
      ])
    });
  }
}

// Handle start with referral
const handleReferral = async (ctx) => {
  try {
    console.log('Referral link detected, checking...');
    const startPayload = ctx.message?.text?.split(' ')[1];
    if (!startPayload || !startPayload.startsWith('ref')) {
      console.log('No valid referral payload found');
      return;
    }
    
    const referrerId = parseInt(startPayload.replace('ref', ''));
    const userId = ctx.from.id;
    
    console.log(`Referral check - Referrer: ${referrerId}, New User: ${userId}`);
    
    // Don't count if user is referring themselves
    if (referrerId === userId) {
      console.log(`User ${userId} tried to refer themselves`);
      return;
    }
    
    try {
      // Read the users file to check if this is a new user
      let users = {};
      try {
        const data = fs.readFileSync('users.json', 'utf8');
        users = JSON.parse(data || '{}');
        console.log(`Current users in users.json: ${Object.keys(users).length}`);
      } catch (error) {
        console.error('Error reading users.json:', error);
        // Continue even if there's an error reading the file
      }
      
      // Check if this user already exists in users.json
      if (users[userId]) {
        console.log(`User ${userId} already exists in users.json, no referral bonus`);
        return;
      }
      
      console.log(`User ${userId} is new, giving bonus to referrer ${referrerId}`);
      
      // Add referral bonus to referrer's balance
      const newBalance = updateUserBalance(referrerId, REFERRAL_BONUS);
      
      // Log the referral
      console.log(`Added ${REFERRAL_BONUS} so'm to user ${referrerId} for referring new user ${userId}. New balance: ${newBalance}`);
      
      // Notify referrer
      try {
        await ctx.telegram.sendMessage(
          referrerId,
          `🎉 Sizning taklif havolangiz orqali yangi foydalanuvchi qo'shildi!\n` +
          `💵 Hisobingizga ${REFERRAL_BONUS} so'm qo'shildi.\n` +
          `💰 Joriy balansingiz: ${newBalance} so'm`
        );
        console.log(`Notification sent to referrer ${referrerId}`);
      } catch (error) {
        console.error(`Failed to send notification to referrer ${referrerId}:`, error);
      }
      
      // Welcome the new user
      try {
        await ctx.reply(
          `👋 Xush kelibsiz! Siz do'stingizning taklif havolasi orqali keldiz.\n` +
          `📢 Botdan to'liq foydalanish uchun quyidagi kanallarga a'zo bo'ling:`
        );
        console.log(`Welcome message sent to new user ${userId}`);
      } catch (error) {
        console.error('Failed to send welcome message:', error);
      }
      
    } catch (error) {
      console.error('Error handling referral:', error);
    }
  } catch (error) {
    console.error('Error in handleReferral:', error);
  }
};

// Add referral handler to start command
bot.start((ctx) => {
  handleReferral(ctx);
  sendMainMenu(ctx);
});

// Promo kodni qo'llash
bot.command('promo', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    await ctx.reply('❌ Noto\'g\'ri buyruq. Iltimos, quyidagi ko\'rinishda kiriting:\n`/promo KOD`', { parse_mode: 'Markdown' });
    return;
  }

  const promoCode = args[1].toUpperCase();
  const promoData = promoCodeStorage.get(promoCode);
  const userId = ctx.from.id;

  if (!promoData) {
    await ctx.reply('❌ Noto\'g\'ri promo kod!');
    return;
  }

  // Check if user already used this promo
  if (promoData.usedBy && promoData.usedBy.includes(userId)) {
    await ctx.reply('⚠️ Siz ushbu promokoddan foydalangansiz!');
    return;
  }

  // Check if promo code has uses left
  if (promoData.usedBy && promoData.usedBy.length >= promoData.uses) {
    await ctx.reply('❌ Ushbu promokodning limiti tugagan!');
    return;
  }

  // Apply promo code
  if (!promoData.usedBy) {
    promoData.usedBy = [];
  }
  promoData.usedBy.push(userId);
  updateUserBalance(userId, promoData.amount);
  promoCodeStorage.set(promoCode, promoData);

  await ctx.reply(
    `✅ Promo kod muvaffaqiyatli qo\'llandi!\n` +
    `💰 Sizning hisobingizga *${promoData.amount}* so'm qo\'shildi.`,
    { parse_mode: 'Markdown' }
  );
});

// Handle menu items
bot.action(/^menu:(.+)$/, async (ctx) => {
  const menuItem = ctx.match[1];
  
  switch(menuItem) {
    // Pul ishlash o'chirildi
    case 'Hisobim':
      await ctx.answerCbQuery();
      await sendAccountMenu(ctx);
      break;
    case 'TG Premium & Stars':
      await ctx.answerCbQuery();
      // ...existing code...
      break;
    case 'Free Fire Almaz': {
      await ctx.answerCbQuery();
      const keyboard = [
        [Markup.button.callback('💎 Almaz sotib olish', 'buy:almaz')],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ];
      await sendOrUpdateMenu(ctx, "💎 Almaz sotib olish bo'limi:", keyboard);
      break;
    }
    case 'PUBG Mobile UC / PP': {
      await ctx.answerCbQuery();
      const keyboard = [
        [Markup.button.callback('UC sotib olish', 'pubg:buy_uc')],
        [Markup.button.callback('PP sotib olish', 'pubg:buy_pp')],
        [Markup.button.callback('⬅️ Orqaga', 'back:main')]
      ];
      await sendOrUpdateMenu(ctx, "PUBG Mobile UC / PP bo'limi:", keyboard);
      break;
    }
    case 'UC Shop':
      await ctx.answerCbQuery();
      await sendUCShop(ctx);
      break;
    case 'SOS':
      await ctx.answerCbQuery();
      await sendSOS(ctx);
      break;
    case 'Promokod':
      await ctx.answerCbQuery();
      await promptPromokod(ctx);
      break;
    case 'Admen paneli':
      if (isAdmin(ctx)) {
        await sendAdminPanel(ctx);
      } else {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
      }
      break;
    default:
      await ctx.answerCbQuery('Ushbu bo\'lim hozircha mavjud emas');
  }
});

// Handle refresh referral link
bot.action('refresh_referral', async (ctx) => {
  await ctx.answerCbQuery('Referal havola yangilandi!');
  await sendEarnMoneyMenu(ctx);
});

// Handle menu button clicks
bot.action(/^menu:(.+)/, async (ctx) => {
  const menuItem = ctx.match[1];
  
  try {
    switch (menuItem) {
      case 'Hisobim':
        await sendAccountMenu(ctx);
        break;
      case 'TG Premium & Stars':
        await sendPremiumMenu(ctx);
        break;
      case 'Free Fire Almaz':
        await ctx.answerCbQuery('Ushbu bo\'lim tez orada ishga tushadi!');
        break;
      case 'PUBG Mobile UC / PP':
        await sendPubgMenu(ctx);
        break;
      case 'UC Shop':
        await sendUCShop(ctx);
        break;
      case 'SOS':
        await sendSOS(ctx);
        break;
      case 'Promokod':
        await promptPromokod(ctx);
        break;
      case 'Admen paneli':
        if (isAdmin(ctx)) {
          await sendAdminPanel(ctx);
        } else {
          await ctx.answerCbQuery('Ruxsat yo\'q!');
        }
        break;
      default:
        await ctx.answerCbQuery('Ushbu bo\'lim hozircha mavjud emas');
    }
  } catch (error) {
    console.error('Menu handler error:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi! Iltimos qaytadan urinib ko\'ring.');
  }
});

// Handle back button
bot.action(/^back:(.+)/, async (ctx) => {
  const target = ctx.match[1];
  
  try {
    switch (target) {
      case 'main':
        // Clear any existing session states
        if (ctx.session) {
          ctx.session = {};
        }
        await sendMainMenu(ctx);
        break;
        
      case 'pubg':
        await sendPubgMenu(ctx);
        break;
        
      case 'uc_shop':
        await sendUCShop(ctx);
        break;
        
      case 'account':
        await sendAccountMenu(ctx);
        break;
        
      case 'earn':
        await sendEarnMoneyMenu(ctx);
        break;
        
      case 'admin':
        if (isAdmin(ctx)) {
          await sendAdminPanel(ctx);
        } else {
          await ctx.answerCbQuery('Ruxsat yo\'q!');
          await sendMainMenu(ctx);
        }
        break;
        
      case 'backToMain':
        await sendAdminPanel(ctx);
        break;
        
      case 'editPremium':
        if (!isAdmin(ctx)) {
          await ctx.answerCbQuery('Ruxsat yo\'q!');
          return;
        }
        
        const premiumPrices = getPremiumPrices();
        let premiumText = '🎖️ *Premium Narxlari*\n\n';
        
        for (const [months, price] of Object.entries(premiumPrices)) {
          premiumText += `🔹 ${months} oy: ${price.toLocaleString()} so'm\n`;
        }
        
        const keyboard = [
          [Markup.button.callback('✏️ 1 oy', 'admin:editPrice:premium:1')],
          [Markup.button.callback('✏️ 3 oy', 'admin:editPrice:premium:3')],
          [Markup.button.callback('✏️ 6 oy', 'admin:editPrice:premium:6')],
          [Markup.button.callback('✏️ 12 oy', 'admin:editPrice:premium:12')],
          [Markup.button.callback('◀️ Orqaga', 'admin:priceMenu')]
        ];
        
        await ctx.editMessageText(premiumText, {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown'
        });
        break;
        
      case 'findUser':
        // Reset find user state
        if (ctx.session.awaitingFindUser) {
          ctx.session.awaitingFindUser = false;
        }
        await sendAdminPanel(ctx);
        break;
        
      default:
        // Default back to main menu
        await sendMainMenu(ctx);
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Back button error:', error);
    try {
      await ctx.answerCbQuery('Xatolik yuz berdi!');
      await sendMainMenu(ctx);
    } catch (e) {
      console.error('Error in error handler:', e);
    }
  }
});

// In-memory storage for promo codes
const promoCodeStorage = new Map();

// Generate a random promo code
function generatePromoCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Check if promo code is valid
async function checkPromoCode(code) {
  const promo = promoCodeStorage.get(code);
  if (!promo) {
    return { valid: false, message: '❌ Noto\'g\'ri promokod!' };
  }
  if (promo.used) {
    return { valid: false, message: '❌ Ushbu promokod allaqachon ishlatilgan!' };
  }
  if (promo.expiresAt && new Date() > new Date(promo.expiresAt)) {
    return { valid: false, message: '❌ Ushbu promokodning muddati o`tgan!' };
  }
  if (promo.usesLeft <= 0) {
    return { valid: false, message: '❌ Ushbu promokodning barcha imkoniyatlari tugagan!' };
  }
  return { 
    valid: true, 
    amount: promo.amount, 
    message: `✅ Promokod qabul qilindi! Sizning hisobingizga ${promo.amount} so'm qo'shildi.` 
  };
}

// Mark promo code as used
function markPromoCodeAsUsed(code, userId) {
  const promo = promoCodeStorage.get(code);
  if (promo) {
    if (!promo.usedBy) {
      promo.usedBy = [];
    }
    if (!promo.usedBy.includes(userId)) {
      promo.usedBy.push(userId);
      promo.usesLeft--;
      if (promo.usesLeft <= 0) {
        promo.used = true;
      }
      return true;
    }
  }
  return false;
}

// --- Referral System ---
// Using global.referrals and global.existingUsers from the top of the file

// ---------- Admin Panel helpers ----------
function isAdmin(ctx) {
  // Check if ctx.from exists and has an id property
  return ctx?.from?.id ? ADMIN_IDS.includes(ctx.from.id) : false;
}

async function sendAdminPanel(ctx) {
  try {
    if (!isAdmin(ctx)) {
      if (ctx.answerCbQuery) {
        try {
          await ctx.answerCbQuery('Ruxsat yo\'q').catch(e => console.log('answerCbQuery error:', e.message));
        } catch (e) {
          console.log('answerCbQuery error:', e.message);
        }
      }
      return;
    }
    
    const channels = getChannels();
    const channelInfo = channels.length > 0 
      ? `\n📢 Joriy kanallar: ${channels.length} ta`
      : '\n⚠️ Hozircha kanallar qo\'shilmagan';
    
    // answerCbQuery ni try-catch ichiga olamiz
    if (ctx.answerCbQuery) {
      try {
        await ctx.answerCbQuery().catch(e => console.log('answerCbQuery error:', e.message));
      } catch (e) {
        console.log('answerCbQuery error:', e.message);
      }
    }
    
    const keyboard = [
      [Markup.button.callback('💳 Karta ma\'lumotlari', 'admin:cardMenu')],
      [Markup.button.callback('💰 Narxlarni o\'zgartirish', 'admin:priceMenu')],
      [Markup.button.callback('🎫 Promokod yaratish', 'admin:createPromo')],
      [Markup.button.callback('📢 Xabar yuborish', 'admin:broadcast')],
      [Markup.button.callback('📊 Statistika', 'admin:stats')],
      [Markup.button.callback('🔙 Asosiy menyu', 'back:main')]
    ];

    const messageText = '👨\u200d💻 *Admin paneli*' +
      channelInfo +
      '\n\nQuyidagi bo\'limlardan birini tanlang:';

    // Agar xabarda rasm bo'lsa, yangi xabar yuboramiz
    if (ctx.update.callback_query?.message?.photo) {
      try {
        await ctx.reply(messageText, {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown'
        });
        // Eski xabarni o'chiramiz
        try {
          await ctx.deleteMessage();
        } catch (e) {
          console.log('Eski xabarni o\'chirib bo\'lmadi:', e.message);
        }
      } catch (e) {
        console.error('Yangi xabar yuborishda xatolik:', e.message);
      }
    } else {
      // Oddiy xabarni tahrirlaymiz
      try {
        await ctx.editMessageText(messageText, {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown'
        });
      } catch (e) {
        console.error('Xabarni tahrirlashda xatolik:', e.message);
        // Tahrirlab bo'lmasa, yangi xabar sifatida yuboramiz
        try {
          await ctx.reply(messageText, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
          });
        } catch (e) {
          console.error('Yangi xabar yuborishda xatolik (2):', e.message);
        }
      }
    }
  } catch (error) {
    console.error('sendAdminPanel xatolik:', error.message);
  }
}

// Handle promo code uses selection
bot.action(/^setPromoUses:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx) || !ctx.session.creatingPromo) {
    await ctx.answerCbQuery('Xatolik!');
    return;
  }
  
  const uses = parseInt(ctx.match[1]);
  ctx.session.creatingPromo.data.uses = uses;
  ctx.session.creatingPromo.step = 'expiry';
  
  await sendOrUpdateMenu(
    ctx,
    `🔄 *Foydalanishlar soni: ${uses} marta*\n\n` +
    `📅 Promo kod qancha kunga amal qiladi?\n` +
    `Iltimos, muddatni kiriting yoki tanlang:`, 
    [
      [Markup.button.callback('1 kun', 'setPromoExpiry:1')],
      [Markup.button.callback('7 kun', 'setPromoExpiry:7')],
      [Markup.button.callback('30 kun', 'setPromoExpiry:30')],
      [Markup.button.callback('◀️ Orqaga', 'admin:promoMenu')]
    ],
    { parse_mode: 'Markdown' }
  );
});

// Handle promo code expiry selection
bot.action(/^setPromoExpiry:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx) || !ctx.session.creatingPromo) {
    await ctx.answerCbQuery('Xatolik!');
    return;
  }
  
  const days = parseInt(ctx.match[1]);
  const { amount, uses } = ctx.session.creatingPromo.data;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  
  await sendOrUpdateMenu(
    ctx,
    `✅ *Promo kod ma'lumotlari*\n\n` +
    `💰 Summa: *${amount.toLocaleString()} so'm*\n` +
    `🔄 Foydalanish: *${uses} marta*\n` +
    `📆 Amal qilish muddati: *${days} kun*\n` +
    `📅 Tugash sanasi: *${expiresAt.toLocaleDateString()}*\n\n` +
    `Promo kodni yaratishni tasdiqlaysizmi?`,
    [
      [Markup.button.callback('✅ Tasdiqlash', 'admin:confirmPromo')],
      [Markup.button.callback('❌ Bekor qilish', 'admin:promoMenu')]
    ],
    { parse_mode: 'Markdown' }
  );
});

// Handle admin message to user callback
bot.action(/admin:message_user:(\d+):(\d+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q');
    return;
  }
  
  const targetUserId = ctx.match[1];
  const adminId = ctx.match[2];
  
  // Only the admin who initiated the search can send messages
  if (ctx.from.id.toString() !== adminId) {
    await ctx.answerCbQuery('Faqat o\'zingiz qidirgan foydalanuvchiga xabar yuborishingiz mumkin');
    return;
  }
  
  // Store the target user ID in session
  ctx.session.messageTargetUser = targetUserId;
  
  // Ask for the message to send
  await ctx.answerCbQuery();
  await sendOrUpdateMenu(
    ctx,
    '✉️ Foydalanuvchiga yubormoqchi bo\'lgan xabaringizni yuboring:',
    [[Markup.button.callback('❌ Bekor qilish', 'admin:findUser')]]
  );
  
  // Set flag to indicate we're waiting for a message
  ctx.session.awaitingUserMessage = true;
});



// Stars narxlari
bot.action('admin:starsPrices', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }
  
  const starsPrices = getStarsPrices();
  let starsText = '⭐ *Stars Narxlari*\n\n';
  
  for (const [amount, price] of Object.entries(starsPrices)) {
    starsText += `🔹 ${amount} ta: ${price.toLocaleString()} so'm\n`;
  }
  
  const keyboard = [
    [Markup.button.callback('✏️ 100 ta', 'admin:editPrice:stars:100')],
    [Markup.button.callback('✏️ 200 ta', 'admin:editPrice:stars:200')],
    [Markup.button.callback('✏️ 500 ta', 'admin:editPrice:stars:500')],
    [Markup.button.callback('✏️ 1000 ta', 'admin:editPrice:stars:1000')],
    [Markup.button.callback('◀️ Orqaga', 'admin:priceMenu')]
  ];
  
  await sendOrUpdateMenu(ctx, starsText, keyboard, { parse_mode: 'Markdown' });
});

bot.action(/admin:(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q');
    return;
  }
  const action = ctx.match[1];
  switch (action) {
    case 'priceMenu':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }
      await ctx.editMessageText('🛒 Narx turlarini tanlang:', {
        reply_markup: {
          inline_keyboard: [
            [Markup.button.callback('🎖️ Premium', 'admin:editPremium')],
            [Markup.button.callback('🔙 Orqaga', 'admin:backToMain')]
          ]
        },
        parse_mode: 'Markdown'
      });
      return;
      
      const starsPrices = getStarsPrices();
      const premiumPrices = getPremiumPrices();
      const ucPrices = getUcPrices();
      const ppPrices = getPpPrices();
      const ffPrices = getFfPrices();
      
      let pricesText = '💰 *Barcha narxlar*\n\n';
      
      // Stars narxlari
      pricesText += '⭐ *Stars narxlari*\n';
      for (const [count, price] of Object.entries(starsPrices)) {
        pricesText += `🔹 ${count} ta: ${price.toLocaleString()} so'm\n`;
      }
      
      // Premium narxlari
      pricesText += '\n🎖️ *Premium narxlari*\n';
      for (const [months, price] of Object.entries(premiumPrices)) {
        pricesText += `🔹 ${months} oy: ${price.toLocaleString()} so'm\n`;
      }
      
      // PUBG UC narxlari
      pricesText += '\n🎮 *PUBG UC Narxlari*\n';
      for (const [amount, price] of Object.entries(ucPrices)) {
        pricesText += `🔹 ${amount} UC: ${price.toLocaleString()} so'm\n`;
      }
      
      // PUBG PP narxlari
      pricesText += '\n🎖️ *PUBG PP Narxlari*\n';
      for (const [amount, price] of Object.entries(ppPrices)) {
        pricesText += `🔹 ${amount} PP: ${price.toLocaleString()} so'm\n`;
      }
      
      // Free Fire narxlari
      pricesText += '\n🔥 *Free Fire Diamond Narxlari*\n';
      for (const [amount, price] of Object.entries(ffPrices)) {
        pricesText += `🔹 ${amount} Diamond: ${price.toLocaleString()} so'm\n`;
      }
      
      const pricesKeyboard = [
        [
          Markup.button.callback('✏️ Stars', 'admin:starsPrices'),
          Markup.button.callback('✏️ Premium', 'admin:premiumPrices')
        ],
        [
          Markup.button.callback('✏️ PUBG UC', 'admin:ucPrices'),
          Markup.button.callback('✏️ PUBG PP', 'admin:ppPrices')
        ],
        [
          Markup.button.callback('✏️ Free Fire', 'admin:ffPrices')
        ],
        [
          Markup.button.callback('◀️ Orqaga', 'back:admin')
        ]
      ];
      
      await sendOrUpdateMenu(ctx, pricesText, pricesKeyboard, { parse_mode: 'Markdown' });
      break;
      
    case 'starsPrices':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }
      
      const starsPricesData = getStarsPrices();
      let starsText = '⭐ *Stars narxlari*\n\n';
      
      for (const [count, price] of Object.entries(starsPricesData)) {
        starsText += `⭐ ${count} ta: ${price.toLocaleString()} so'm\n`;
      }
      
      const starsKeyboard = [
        [Markup.button.callback('✏️ 100 ta', 'admin:editPrice:stars:100')],
        [Markup.button.callback('✏️ 200 ta', 'admin:editPrice:stars:200')],
        [Markup.button.callback('✏️ 500 ta', 'admin:editPrice:stars:500')],
        [Markup.button.callback('✏️ 1000 ta', 'admin:editPrice:stars:1000')],
        [Markup.button.callback('◀️ Orqaga', 'admin:priceMenu')]
      ];
      
      await sendOrUpdateMenu(ctx, starsText, starsKeyboard, { parse_mode: 'Markdown' });
      break;
      
    case 'premiumPrices':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }
      
      const premiumPricesData = getPremiumPrices();
      let premiumText = '🎖️ *Premium narxlari*\n\n';
      
      for (const [months, price] of Object.entries(premiumPricesData)) {
        premiumText += `🎖️ ${months} oy: ${price.toLocaleString()} so'm\n`;
      }
      
      const premiumKeyboard = [
        [Markup.button.callback('✏️ 1 oy', 'admin:editPrice:premium:1')],
        [Markup.button.callback('✏️ 3 oy', 'admin:editPrice:premium:3')],
        [Markup.button.callback('✏️ 6 oy', 'admin:editPrice:premium:6')],
        [Markup.button.callback('✏️ 12 oy', 'admin:editPrice:premium:12')],
        [Markup.button.callback('◀️ Orqaga', 'admin:priceMenu')]
      ];
      
      await sendOrUpdateMenu(ctx, premiumText, premiumKeyboard, { parse_mode: 'Markdown' });
      break;
      
    case 'editPrice':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }
      
      const [_, type, key] = ctx.match[1].split(':');
      ctx.session.editingPrice = { type, key };
      
      // Item nomini va joriy narxni aniqlash
      let itemName = '';
      let currentPrice = 0;
      let backButton = 'admin:priceMenu';
      
      if (type === 'premium') {
        itemName = `${key} oy Premium`;
        currentPrice = getPremiumPrices()[key] || 0;
        backButton = 'admin:editPremium';
        
        await ctx.editMessageText(
          `💰 *${itemName} narxini o'zgartirish*\n\n` +
          `Joriy narx: *${currentPrice.toLocaleString()} so'm*\n\n` +
          `Yangi narxni so'mda yuboring (faqat raqamlar):`,
          {
            reply_markup: {
              inline_keyboard: [
                [Markup.button.callback('❌ Bekor qilish', backButton)]
              ]
            },
            parse_mode: 'Markdown'
          }
        );
        return;
      }
      
      switch (type) {
        case 'stars':
          itemName = `${key} ta Stars`;
          currentPrice = getStarsPrices()[key] || 0;
          backButton = 'admin:starsPrices';
          break;
        case 'premium':
          itemName = `${key} oylik Premium`;
          currentPrice = getPremiumPrices()[key] || 0;
          backButton = 'admin:premiumPrices';
          break;
        case 'uc':
          itemName = `${key} UC`;
          currentPrice = getUcPrices()[key] || 0;
          backButton = 'admin:ucPrices';
          break;
        case 'pp':
          itemName = `${key} PP`;
          currentPrice = getPpPrices()[key] || 0;
          backButton = 'admin:ppPrices';
          break;
        case 'ff':
          itemName = `${key} Diamond`;
          currentPrice = getFfPrices()[key] || 0;
          backButton = 'admin:ffPrices';
          break;
        default:
          itemName = key;
          backButton = 'admin:priceMenu';
      }
      
      const priceUpdateMessage = 
        `💰 *${itemName} narxini yangilash*\n\n` +
        `Joriy narx: *${currentPrice.toLocaleString()} so'm*\n` +
        `Yangi narxni so'mda yuboring (faqat raqamlar):`;
      
      // To'g'ridan-to'g'ri xabar yuborish
      await ctx.replyWithMarkdown(priceUpdateMessage, {
        reply_markup: {
          inline_keyboard: [
            [Markup.button.callback('❌ Bekor qilish', backButton)]
          ]
        }
      });
      break;
      
    case 'cardMenu':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }
      
      const cardInfoText = `💳 *Karta ma'lumotlari*\n` +
        `👤 Egasi: ${process.env.CARD_OWNER || 'Mavjud emas'}\n` +
        `💳 Uzcard: \`${process.env.UZCARD_NUMBER || 'Mavjud emas'}\`\n` +
        `💳 Humo: \`${process.env.HUMO_NUMBER || 'Mavjud emas'}\``;
        
      const cardMenuKeyboard = [
        [Markup.button.callback('✏️ Karta egasini o\'zgartirish', 'admin:editCardOwner')],
        [Markup.button.callback('💳 Uzcard raqamini o\'zgartirish', 'admin:editUzcard')],
        [Markup.button.callback('💳 Humo raqamini o\'zgartirish', 'admin:editHumo')],
        [Markup.button.callback('◀️ Orqaga', 'back:admin')]
      ];
      
      await sendOrUpdateMenu(ctx, cardInfoText, cardMenuKeyboard, { parse_mode: 'Markdown' });
      break;
      
    case 'editCardOwner':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }
      
      ctx.session.editingCardField = 'CARD_OWNER';
      await sendOrUpdateMenu(
        ctx, 
        '✏️ Yangi karta egasining ism familiyasini yuboring:',
        [[Markup.button.callback('❌ Bekor qilish', 'admin:cardMenu')]],
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'editUzcard':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }
      
      ctx.session.editingCardField = 'UZCARD_NUMBER';
      await sendOrUpdateMenu(
        ctx, 
        '💳 Yangi Uzcard raqamini yuboring (faqat raqamlar):',
        [[Markup.button.callback('❌ Bekor qilish', 'admin:cardMenu')]],
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'editHumo':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }
      
      ctx.session.editingCardField = 'HUMO_NUMBER';
      await sendOrUpdateMenu(
        ctx, 
        '💳 Yangi Humo raqamini yuboring (faqat raqamlar):',
        [[Markup.button.callback('❌ Bekor qilish', 'admin:cardMenu')]],
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'stats':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }
      
      try {
        // Load users from the database
        const users = loadUsers();
        const totalUsers = Object.keys(users).length;
        
        // Count active users (users who were active in the last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const activeUsers = Object.values(users).filter(user => {
          const lastSeen = user.last_seen ? new Date(user.last_seen) : null;
          return lastSeen && lastSeen >= thirtyDaysAgo;
        }).length;
        
        // Initialize and ensure orders is an array
        if (!Array.isArray(global.orders)) {
          console.log('Initializing orders array as it was not an array');
          global.orders = [];
        }
        
        // Ensure all orders have required fields
        const allOrders = global.orders
          .filter(order => order && typeof order === 'object')
          .map(order => ({
            ...order,
            status: order.status || 'unknown',
            price: Number(order.price) || 0,
            timestamp: order.timestamp || new Date(0).toISOString()
          }));
          
        const totalOrders = allOrders.length;
        const completedOrders = allOrders.filter(o => o.status === 'completed');
        const totalRevenue = completedOrders.reduce((sum, order) => sum + order.price, 0);
        
        // Count today's orders and revenue
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOrders = completedOrders.filter(order => {
          try {
            const orderDate = order.timestamp ? new Date(order.timestamp) : null;
            return orderDate && orderDate >= today;
          } catch (e) {
            console.error('Error processing order date:', e);
            return false;
          }
        });
        const todayRevenue = todayOrders.reduce((sum, order) => sum + order.price, 0);
        
        // Count pending top-ups (if you have this feature)
        const pendingTopUps = 0; // Initialize to 0 if you don't have this feature
        
        // Format statistics message
        const statsMessage = `📊 *Bot Statistikasi*\n\n` +
          `👥 *Umumiy foydalanuvchilar:* ${totalUsers.toLocaleString()} ta\n` +
          `🔄 *Faol foydalanuvchilar (30 kun):* ${activeUsers.toLocaleString()} ta\n\n` +
          `📦 *Buyurtmalar:*\n` +
          `   • Jami: ${totalOrders.toLocaleString()} ta\n` +
          `   • Bugungi: ${todayOrders.length.toLocaleString()} ta\n` +
          `   • Tugallangan: ${completedOrders.length.toLocaleString()} ta\n\n` +
          `💰 *Daromad:*\n` +
          `   • Jami: ${totalRevenue.toLocaleString()} so'm\n` +
          `   • Bugungi: ${todayRevenue.toLocaleString()} so'm\n\n` +
          `⏳ *Kutilayotgan to'lovlar:* ${pendingTopUps} ta\n`;
        
        const keyboard = [
          [Markup.button.callback('🔄 Yangilash', 'admin:stats')],
          [Markup.button.callback('◀️ Orqaga', 'back:admin')]
        ];
        
        await sendOrUpdateMenu(ctx, statsMessage, keyboard, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
      } catch (error) {
        console.error('Statistika yuklashda xatolik:', error);
        await ctx.answerCbQuery('❌ Xatolik yuz berdi!', true);
      }
      break;
      
    case 'promoMenu':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }

      const now = new Date();
      let activePromos = 0;
      let expiredPromos = 0;
      let totalBonus = 0;
      
      const promoList = Array.from(promoCodeStorage.entries())
        .map(([code, data]) => {
          const usedCount = data.usedBy ? data.usedBy.length : 0;
          const isExpired = data.expiresAt && new Date(data.expiresAt) < now;
          const remainingUses = data.usesLeft || 0;
          
          if (isExpired || remainingUses <= 0) {
            expiredPromos++;
          } else {
            activePromos++;
            totalBonus += data.amount * (data.totalUses || 1);
          }
          
          const status = isExpired ? '🕒 Muddati o\'tgan' : 
                         remainingUses <= 0 ? '❌ Tugagan' : '✅ Faol';
                          
          const expiryInfo = data.expiresAt ? 
            `\n   └─ ⏳ ${new Date(data.expiresAt).toLocaleDateString()}` : '';
            
          return `${status} *${code}*: ${data.amount.toLocaleString()} so'm\n` +
                 `   ├─ ${usedCount}/${data.totalUses} foydalanilgan` +
                 expiryInfo;
        })
        .join('\n\n') || 'Hozircha promo kodlar mavjud emas.';

      const stats = `📊 *Statistika*\n` +
                   `• Faol promokodlar: ${activePromos} ta\n` +
                   `• Tugagan/eskirgan: ${expiredPromos} ta\n` +
                   `• Jami bonus: ${totalBonus.toLocaleString()} so'm\n\n`;

      const promoMenuMessage = `🎫 *Promo Kodlar Boshqaruvi*\n\n${stats}📋 *Mavjud promokodlar:*\n\n${promoList}`;

      const promoMenuKeyboard = [
        [Markup.button.callback('➕ Yangi promo kod', 'admin:createPromo')],
        [Markup.button.callback('🗑 Barcha promokodlarni o\'chirish', 'admin:deleteAllPromos')],
        [Markup.button.callback('🔄 Yangilash', 'admin:promoMenu')],
        [Markup.button.callback('◀️ Orqaga', 'back:admin')]
      ];

      await sendOrUpdateMenu(ctx, promoMenuMessage, promoMenuKeyboard, { 
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
      break;

    case 'createPromo':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }

      ctx.session.creatingPromo = {
        step: 'amount',
        data: {
          amount: 0,
          uses: 1,
          expiresInDays: 7
        }
      };

      await sendOrUpdateMenu(
        ctx,
        '🆕 *Yangi Promo Kod Yaratish*\n\nIltimos, promo kod miqdorini kiriting (so\'mda):',
        [[Markup.button.callback('◀️ Orqaga', 'admin:promoMenu')]],
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'promoUses':
      if (!isAdmin(ctx) || !ctx.session.creatingPromo) {
        await ctx.answerCbQuery('Xatolik!');
        return;
      }
      
      ctx.session.creatingPromo.step = 'uses';
      await sendOrUpdateMenu(
        ctx,
        '🔄 *Nechi marta ishlatilishi mumkin?*\n\nIltimos, foydalanishlar sonini kiriting:',
        [
          [Markup.button.callback('1 marta', 'setPromoUses:1')],
          [Markup.button.callback('5 marta', 'setPromoUses:5')],
          [Markup.button.callback('10 marta', 'setPromoUses:10')],
          [Markup.button.callback('100 marta', 'setPromoUses:100')],
          [Markup.button.callback('◀️ Orqaga', 'admin:promoMenu')]
        ],
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'promoExpiry':
      if (!isAdmin(ctx) || !ctx.session.creatingPromo) {
        await ctx.answerCbQuery('Xatolik!');
        return;
      }
      
      ctx.session.creatingPromo.step = 'expiry';
      await sendOrUpdateMenu(
        ctx,
        '📅 *Promo kod qancha kunga amal qiladi?*\n\nIltimos, muddatni tanlang:',
        [
          [Markup.button.callback('1 kun', 'setPromoExpiry:1')],
          [Markup.button.callback('7 kun', 'setPromoExpiry:7')],
          [Markup.button.callback('30 kun', 'setPromoExpiry:30')],
          [Markup.button.callback('90 kun', 'setPromoExpiry:90')],
          [Markup.button.callback('◀️ Orqaga', 'admin:promoMenu')]
        ],
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'confirmPromo':
      if (!isAdmin(ctx) || !ctx.session.creatingPromo) {
        await ctx.answerCbQuery('Xatolik!');
        return;
      }
      
      const { amount, uses, expiresInDays } = ctx.session.creatingPromo.data;
      const promoCode = generatePromoCode();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      
      promoCodeStorage.set(promoCode, {
        amount: parseInt(amount),
        usesLeft: parseInt(uses),
        totalUses: parseInt(uses),
        used: false,
        usedBy: [],
        createdAt: new Date(),
        expiresAt: expiresAt
      });
      
      await sendOrUpdateMenu(
        ctx,
        `✅ *Yangi promo kod yaratildi!*\n\n` +
        `🔑 KOD: *${promoCode}*\n` +
        `💰 Summa: *${amount.toLocaleString()} so'm*\n` +
        `🔄 Foydalanish: *${uses} marta*\n` +
        `📆 Amal qilish muddati: *${expiresInDays} kun*\n\n` +
        `Foydalanish uchun: /promo ${promoCode}`,
        [[Markup.button.callback('◀️ Orqaga', 'admin:promoMenu')]],
        { parse_mode: 'Markdown' }
      );
      
      delete ctx.session.creatingPromo;
      break;
      
    case 'deleteAllPromos':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }

      const confirmKeyboard = [
        [
          Markup.button.callback('✅ Ha, o\'chirish', 'admin:confirmDeleteAllPromos'),
          Markup.button.callback('❌ Bekor qilish', 'admin:promoMenu')
        ]
      ];

      await sendOrUpdateMenu(
        ctx,
        '⚠️ *Barcha promo kodlar o\'chiriladi!*\n\nIshonchingiz komilmi?',
        confirmKeyboard,
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'confirmDeleteAllPromos':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }

      const count = promoCodeStorage.size;
      promoCodeStorage.clear();

      await sendOrUpdateMenu(
        ctx,
        `✅ *${count} ta promo kod o'chirib tashlandi!*`,
        [[Markup.button.callback('◀️ Orqaga', 'admin:promoMenu')]],
        { parse_mode: 'Markdown' }
      );
      break;
    case 'stats':
      await ctx.answerCbQuery();
      // Demo statistik ma'lumot
      await ctx.reply('Foydalanuvchilar soni: 123\nBugungi tranzaksiyalar: 45');
      break;
    case 'findUser':
      ctx.session.awaitingFindUser = true;
      await ctx.answerCbQuery();
      
      // Show recent users with pagination
      const recentUsers = Array.from(global.botUsers || []).slice(-5);
      let message = '👥 *Foydalanuvchi qidirish*\n\n' +
        'Foydalanuvchi ID, ismi yoki username orqali qidiring.\n\n' +
        '🔄 *So\'nggi foydalanuvchilar:*\n';
      
      if (recentUsers.length > 0) {
        for (const userId of recentUsers) {
          try {
            const user = await ctx.telegram.getChat(userId);
            const userBalance = getUserBalance(userId);
            message += `\n👤 ${user.first_name || ''} ${user.last_name || ''}\n` +
                      `🆔 ${userId} | 💰 ${userBalance.toLocaleString()} so'm\n` +
                      `@${user.username || 'username yo\'q'}\n`;
          } catch (error) {
            console.error(`Foydalanuvchi ma'lumotlarini olishda xatolik (${userId}):`, error);
          }
        }
      } else {
        message += '\nHozircha foydalanuvchilar mavjud emas.';
      }
      
      await sendOrUpdateMenu(
        ctx,
        message,
        [
          [Markup.button.callback('🔄 Yangilash', 'admin:findUser')],
          [Markup.button.callback('◀️ Orqaga', 'back:admin')]
        ]
      );
      break;
    case 'broadcast':
      if (!isAdmin(ctx)) {
        await ctx.answerCbQuery('Ruxsat yo\'q!');
        return;
      }
      
      ctx.session.awaitingBroadcast = true;
      ctx.session.broadcastState = { step: 'awaiting_message' };
      
      const broadcastKeyboard = [
        [Markup.button.callback('❌ Bekor qilish', 'cancel_broadcast')]
      ];
      
      await sendOrUpdateMenu(
        ctx,
        '📢 *Xabar yuborish*\n\n' +
        'Barcha foydalanuvchilarga yubormoqchi bo\'lgan xabaringizni yuboring.\n\n' +
        '⚠️ *Eslatma:*\n' +
        '• Xabaringiz to\'g\'ri ekanligiga ishonch hosil qiling\n' +
        '• Yuborish jarayoni bir necha daqiqa davom etishi mumkin',
        broadcastKeyboard,
        { parse_mode: 'Markdown' }
      );
      break;
  }
});

// Handle text messages for broadcast
bot.on('text', async (ctx, next) => {
  // Skip if not from admin or not awaiting broadcast
  if (!isAdmin(ctx) || !ctx.session.awaitingBroadcast) {
    return next();
  }
  
  try {
    const message = ctx.message.text;
    const users = loadUsers();
    const userIds = Object.keys(users);
    
    if (userIds.length === 0) {
      await ctx.reply('❌ Hech qanday foydalanuvchi topilmadi!');
      ctx.session.awaitingBroadcast = false;
      delete ctx.session.broadcastState;
      return;
    }
    
    // Create confirmation keyboard
    const keyboard = [
      [
        Markup.button.callback('✅ Ha, yuborish', 'confirm_broadcast'),
        Markup.button.callback('❌ Bekor qilish', 'cancel_broadcast')
      ]
    ];
    
    // Store message in session
    ctx.session.broadcastState = {
      step: 'confirm',
      message: message,
      totalUsers: userIds.length
    };
    
    // Show preview and ask for confirmation
    await ctx.reply(
      `📝 *Xabar ko\'rinishi:*\n\n${message}\n\n` +
      `📊 Jami ${userIds.length} ta foydalanuvchiga yuboriladi. Xabarni yuborishni tasdiqlaysizmi?`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      }
    );
    
  } catch (error) {
    console.error('Xabar yuborishda xatolik:', error);
    await ctx.reply('❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    ctx.session.awaitingBroadcast = false;
    delete ctx.session.broadcastState;
  }
});

// Handle broadcast cancellation
bot.action('cancel_broadcast', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }

  try {
    // Clean up session
    ctx.session.awaitingBroadcast = false;
    delete ctx.session.broadcastState;
    
    // Send confirmation to admin
    await ctx.editMessageText(
      '❌ Xabar yuborish bekor qilindi.',
      Markup.inlineKeyboard([
        Markup.button.callback('◀️ Admin paneliga qaytish', 'back:admin')
      ])
    );
  } catch (error) {
    console.error('Error cancelling broadcast:', error);
    await ctx.answerCbQuery('❌ Xatolik yuz berdi!');
  }
});

// Handle broadcast confirmation
bot.action('confirm_broadcast', async (ctx) => {
  if (!isAdmin(ctx) || !ctx.session.broadcastState?.message) {
    await ctx.answerCbQuery('Xatolik yuz berdi!');
    return;
  }
  
  const broadcastText = ctx.session.broadcastState.message;
  
  try {
    // Send a confirmation to admin
    const processingMsg = await ctx.reply('📡 Xabar foydalanuvchilarga yuborilmoqda... Iltimos, kuting.');
    
    // Get all users from the database
    const users = loadUsers();
    const usersToNotify = Object.keys(users);
    
    if (usersToNotify.length === 0) {
      await ctx.answerCbQuery('❌ Hech qanday foydalanuvchi topilmadi!');
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    // Store message IDs for possible deletion
    const messageIds = {};
    
    // Send to each user with progress updates
    const totalUsers = usersToNotify.length;
    let processed = 0;
    
    for (const userId of usersToNotify) {
      try {
        const sentMessage = await ctx.telegram.sendMessage(
          userId, 
          `📢 *Xabar adminstratsiyadan:*\n\n${broadcastText}`, 
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [Markup.button.callback('❌ Xabarni yopish', 'delete_message')]
              ]
            }
          }
        );
        
        // Store message ID for possible deletion
        messageIds[userId] = sentMessage.message_id;
        successCount++;
        
        // Update progress every 5 users
        processed++;
        if (processed % 5 === 0) {
          const progress = Math.floor((processed / totalUsers) * 100);
          try {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              processingMsg.message_id,
              null,
              `📡 Xabar yuborilmoqda...\n` +
              `🔄 ${processed}/${totalUsers} (${progress}%)`
            );
          } catch (e) {
            console.error('Progress yangilashda xatolik:', e);
          }
        }
        
        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Xabar yuborishda xatolik (${userId}):`, error);
        failCount++;
      }
    }
    
    // Update broadcast state with message IDs
    if (ctx.session.broadcastState) {
      ctx.session.broadcastState.messageIds = messageIds;
    }
    
    // Update the admin with results
    const resultText = `✅ Xabar muvaffaqiyatli yuborildi!\n\n` +
      `✓ Muvaffaqiyatli: ${successCount} ta\n` +
      `✗ Xatolik: ${failCount} ta\n\n` +
      `📝 Xabar matni:\n${broadcastText}\n\n` +
      `❌ *Barcha xabarlarni o'chirish* tugmasi orqali yuborilgan xabarlarni bekor qilishingiz mumkin.`;
    
    const keyboard = [
      [Markup.button.callback('❌ Barcha xabarlarni o\'chirish', 'cancel_broadcast')],
      [Markup.button.callback('◀️ Orqaga', 'back:admin')]
    ];
    
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        null,
        resultText,
        { 
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        }
      );
    } catch (editError) {
      console.error('Xabarni yangilashda xatolik:', editError);
      await ctx.reply(resultText, { 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
    }
    
  } catch (error) {
    console.error('Xabar yuborishda xatolik:', error);
    await ctx.reply('❌ Xabar yuborishda xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Handle message deletion by users
bot.action('delete_message', async (ctx) => {
  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.error('Xabarni o\'chirishda xatolik:', error);
    await ctx.answerCbQuery('❌ Xabarni o\'chirib bo\'lmadi', true);
  }
});

async function sendUCShop(ctx) {
  await ctx.answerCbQuery();
  await sendOrUpdateMenu(ctx, 'UC Shop kanalimizga o\'ting:', [
    [Markup.button.url('➡️ Kanalga o\'tish', UC_CHANNEL_URL)],
    [Markup.button.callback('⬅️ Orqaga', 'back:main')]
  ]);
}

async function sendSOS(ctx) {
  await ctx.answerCbQuery();
  // Escape special characters in the admin username for Markdown
  const escapedAdmin = ADMIN_USER.replace(/[_*`[\]()~>#+=|{}.!-]/g, '\\$&');
  await sendOrUpdateMenu(ctx, `👤 Admin: ${escapedAdmin}`, [
    [Markup.button.callback('⬅️ Orqaga', 'back:main')]
  ], { parse_mode: 'Markdown' });
}

async function promptPromokod(ctx) {
  await ctx.answerCbQuery();
  ctx.session.awaitingPromo = true;
  await ctx.reply('Promokodni kiriting:');
}

// Top-up bosqichlari uchun handler
bot.action('topup:amount', async (ctx) => {
  ctx.session.topup = { step: 'amount' };
  await sendOrUpdateMenu(ctx, '💵 Iltimos, to\'ldirmoqchi bo\'lgan summani kiriting (so\'mda):', [
    [Markup.button.callback('⬅️ Orqaga', 'back:account')]
  ]);
});

// Orqaga hisob menyusiga qaytish
bot.action('back:account', async (ctx) => {
  await sendAccountMenu(ctx);
});

// Orqaga admin paneliga qaytish
bot.action('back:admin', async (ctx) => {
  await sendAdminPanel(ctx);
});

// Channel management menu
bot.action('admin:channelMenu', async (ctx) => {
  await sendAdminChannelMenu(ctx);
});

// To'ldirish summasini qabul qilish
bot.on('text', async (ctx, next) => {
  // Agar topup jarayoni boshlamagan bo'lsa, keyingi middlewarega o'tkazamiz
  if (!ctx.session.topup) {
    return next();
  }

  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  // To'ldirish summasi
  if (ctx.session.topup.step === 'amount') {
    const amount = parseInt(text);
    if (isNaN(amount) || amount < 1000) {
      await ctx.reply('❌ Iltimos, 1000 so\'mdan ko\'proq summa kiriting!');
      return;
    }

    ctx.session.topup = {
      step: 'method',
      amount: amount
    };

    const keyboard = [
      [Markup.button.callback('💳 Uzcard', 'topup:method:uzcard')],
      [Markup.button.callback('💳 Humo', 'topup:method:humo')],
      [Markup.button.callback('⬅️ Orqaga', 'back:account')]
    ];

    await sendOrUpdateMenu(ctx, `💳 To'lov usulini tanlang:\n💵 Summa: ${amount.toLocaleString()} so'm`, keyboard);
  } else {
    return next();
  }
});

// To'lov usulini tanlash
bot.action(/topup:method:(.+)/, async (ctx) => {
  const method = ctx.match[1];
  const { amount } = ctx.session.topup;
  
  // Get card information from environment
  const cardInfo = getCardInfo();
  
  // To'lov kartalari ma'lumotlari
  const cards = {
    uzcard: {
      number: process.env.UZCARD_NUMBER ? formatCardNumber(process.env.UZCARD_NUMBER) : '8600123456789012',
      name: process.env.CARD_OWNER || 'Karta egasi',
      type: 'Uzcard'
    },
    humo: {
      number: process.env.HUMO_NUMBER ? formatCardNumber(process.env.HUMO_NUMBER) : '9860123456789012',
      name: process.env.CARD_OWNER || 'Karta egasi',
      type: 'Humo'
    }
  };

  const card = cards[method];
  const paymentAmount = amount; // No more 3% discount

  const message = `💳 *${card.type} orqali to'lov*\n` +
    `💳 Karta raqami: \`${card.number}\`\n` +
    `👤 Karta egasi: ${card.name}\n\n` +
    `💵 *To'lov summasi:* ${paymentAmount.toLocaleString()} so'm\n` +
    `📝 *Izoh:* ${ctx.from.id}\n\n` +
    `💡 Iltimos, to'lov qilgandan so'ng chek rasmini yuboring.\n` +
    `🔄 To'lov tekshirilgach, balansingizga ${amount.toLocaleString()} so'm qo'shiladi.`;

  const keyboard = [
    [Markup.button.callback('✅ To\'lov qildim', 'topup:check_payment')],
    [Markup.button.callback('❌ Bekor qilish', 'back:account')]
  ];

  await sendOrUpdateMenu(ctx, message, keyboard, { parse_mode: 'Markdown' });
  ctx.session.topup.step = 'waiting_payment';
  ctx.session.topup.method = method;
  ctx.session.topup.paymentAmount = paymentAmount;
});

// To'lovni admin tasdiqlash uchun yuborish
bot.action('topup:check_payment', async (ctx) => {
  if (!ctx.session.topup) {
    await ctx.answerCbQuery('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
    return await sendAccountMenu(ctx);
  }

  const { amount, method, paymentAmount } = ctx.session.topup;
  const userId = ctx.from.id;
  const username = ctx.from.username || 'Foydalanuvchi';
  
  // Buyurtma ID yaratamiz
  const paymentId = generateOrderId();
  
  // Adminlarga xabar yuboramiz
  // Escape special characters for Markdown
  const escapeMarkdown = (text) => {
    return text.replace(/[_*[\]()~`>#+\-={}|.!]/g, '\\$&');
  };

  // Format message with MarkdownV2
  const adminMessage = '💳 *Yangi to\'lov so\'rovi*\n' +
    '👤 Foydalanuvchi: ' + escapeMarkdown('@' + username) + ' \\(' + 'ID: ' + userId + '\\)\n' +
    '💰 Summa: ' + escapeMarkdown(amount.toLocaleString()) + ' so\'m\n' +
    '💳 To\'lov usuli: ' + (method === 'uzcard' ? 'Uzcard' : 'Humo') + '\n' +
    '💸 To\'lov summasi: ' + escapeMarkdown(paymentAmount.toLocaleString()) + ' so\'m\n' +
    '📅 Sana: ' + escapeMarkdown(new Date().toLocaleString()) + '\n\n' +
    '🆔 Buyurtma ID: `' + paymentId + '`';
  
  // Admin paneliga tasdiqlash tugmalari bilan yuboramiz
  const adminKeyboard = [
    [
      Markup.button.callback('✅ Tasdiqlash', `confirm_payment:${paymentId}:${userId}:${amount}`),
      Markup.button.callback('❌ Rad etish', `reject_payment:${paymentId}:${userId}`)
    ]
  ];
  
  try {
    // Barcha adminlarga xabar yuboramiz
    for (const adminId of ADMIN_IDS) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          adminMessage,
          { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: adminKeyboard } }
        );
      } catch (error) {
        // Don't log sensitive info to console
        await ctx.telegram.sendMessage(
          ADMIN_IDS[0], // Send to first admin
          `⚠️ Xatolik: Adminlarga xabar yuborishda muammo yuz berdi. Admin ID: ${adminId}`,
          { parse_mode: 'Markdown' }
        );
      }
    }
    
    // Foydalanuvchiga xabar beramiz
    await ctx.answerCbQuery('To\'lovingiz adminlar tomonidan tekshirilmoqda. Iltimos, kuting...');
    await sendOrUpdateMenu(
      ctx,
      `✅ To'lov so'rovingiz qabul qilindi.\n` +
      `💰 Summa: ${amount.toLocaleString()} so'm\n` +
      `🆔 Buyurtma ID: ${paymentId}\n\n` +
      `📞 To'lov tez orada tasdiqlanadi. Agar uzoq vaqt kutib tursangiz, @d1yor_salee ga murojaat qiling.`,
      [[Markup.button.callback('⬅️ Asosiy menyu', 'back:account')]]
    );
    
    // Sessiyani tozalash
    delete ctx.session.topup;
    
  } catch (error) {
    // Don't log error details to console
    await ctx.answerCbQuery('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
    await sendAccountMenu(ctx);
    // Notify admin about the error
    await ctx.telegram.sendMessage(
      ADMIN_IDS[0],
      `⚠️ Xatolik: To'lov so'rovini qayta ishlashda muammo yuz berdi.\nFoydalanuvchi ID: ${ctx.from.id}`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Admin tomonidan to'lovni tasdiqlash
bot.action(/confirm_payment:(\w+):(\d+):(\d+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }
  
  const paymentId = ctx.match[1];
  const userId = parseInt(ctx.match[2]);
  const amount = parseInt(ctx.match[3]);
  const username = ctx.from.username || 'noma\'lum admin';
  
  try {
    // Balansni yangilash
    updateUserBalance(userId, amount);
    
    // Escape special characters for MarkdownV2
    const escapeMarkdown = (text) => {
      return String(text).replace(/[_*[\]()~`>#+\-={}|.!]/g, '\\$&');
    };
    
    // Adminlarga xabar
    await ctx.answerCbQuery('✅ To\'lov tasdiqlandi!');
    try {
      await ctx.editMessageText(
        escapeMarkdown(ctx.update.callback_query.message.text) + '\n\n' +
        '✅ *Tasdiqlandi*\n' +
        '👤 Admin: ' + escapeMarkdown('@' + username) + '\n' +
        '🕒 Sana: ' + escapeMarkdown(new Date().toLocaleString()),
        { parse_mode: 'MarkdownV2' }
      );
    } catch (editError) {
      console.error('Xabarni yangilashda xatolik:', editError);
      await ctx.answerCbQuery('✅ To\'lov tasdiqlandi (xabarni yangilab bo\'lmadi)');
    }
    
    // Foydalanuvchiga xabar
    try {
      const userBalance = getUserBalance(userId);
      const userMessage = '✅ *To\'lov tasdiqlandi!*\\!\n\n' +
        '💰 Summa: ' + escapeMarkdown(amount.toLocaleString()) + ' so\'m\n' +
        '💳 Yangi balans: ' + escapeMarkdown(userBalance.toLocaleString()) + ' so\'m\n' +
        '🆔 Buyurtma ID: `' + paymentId + '`\n\n' +
        '📞 Murojaat uchun: @d1yor_salee';
      
      console.log('Foydalanuvchiga yuborilayotgan xabar:', {
        userId,
        message: userMessage,
        balance: userBalance
      });

      // 1-usul: Oddiy xabar yuborish
      try {
        const sentMessage = await ctx.telegram.sendMessage(
          userId,
          userMessage,
          { parse_mode: 'MarkdownV2' }
        );
        console.log('Xabar muvaffaqiyatli yuborildi:', sentMessage);
      } catch (sendError) {
        console.error('1-usul: Xabar yuborishda xatolik:', sendError);
        
        // 2-usul: Boshqa formatda yuborishga harakat qilamiz
        try {
          const simpleMessage = '✅ To\'lovingiz tasdiqlandi!\n\n' +
            '💰 Summa: ' + amount.toLocaleString() + ' so\'m\n' +
            '💳 Yangi balans: ' + userBalance.toLocaleString() + ' so\'m\n' +
            '🆔 Buyurtma ID: ' + paymentId + '\n\n' +
            '📞 Murojaat uchun: @d1yor_salee';
            
          await ctx.telegram.sendMessage(userId, simpleMessage);
          console.log('2-usul: Oddiy formatdagi xabar yuborildi');
        } catch (simpleError) {
          console.error('2-usul ham ishlamadi:', simpleError);
          throw simpleError; // Xatolikni yuqoriga yuboramiz
        }
      }
      
    } catch (error) {
      console.error('Foydalanuvchiga xabar yuborishda xatolik:', error);
      // Notify admin about the error
      try {
        await ctx.telegram.sendMessage(
          ADMIN_IDS[0],
          '⚠️ Xatolik: Foydalanuvchiga tasdiqlash xabarini yuborib bo\'lmadi\n' +
          'Buyurtma ID: `' + paymentId + '`\n' +
          'Foydalanuvchi ID: ' + userId + '\n' +
          'Xatolik: ' + escapeMarkdown(error.message || 'Noma\'lum xatolik'),
          { parse_mode: 'MarkdownV2' }
        );
      } catch (e) {
        console.error('Adminlarga xabar yuborishda xatolik:', e);
      }
    }
    
  } catch (error) {
    console.error('To\'lovni tasdiqlashda xatolik:', error);
    try {
      await ctx.answerCbQuery('❌ Xatolik yuz berdi!');
    } catch (e) {}
    
    // Notify admin about the error
    try {
      await ctx.telegram.sendMessage(
        ADMIN_IDS[0],
        '⚠️ Xatolik: To\'lovni tasdiqlashda muammo yuz berdi\n' +
        'Buyurtma ID: `' + paymentId + '`\n' +
        'Foydalanuvchi ID: ' + userId + '\n' +
        'Xatolik: ' + escapeMarkdown(error.message || 'Noma\'lum xatolik'),
        { parse_mode: 'MarkdownV2' }
      );
    } catch (e) {
      console.error('Adminlarga xabar yuborishda xatolik:', e);
    }
  }
});

// Admin tomonidan to'lovni rad etish
bot.action(/reject_payment:(\w+):(\d+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }
  
  const paymentId = ctx.match[1];
  const userId = parseInt(ctx.match[2]);
  const username = ctx.from.username || 'noma\'lum admin';
  
  try {
    // Adminlarga xabar
    await ctx.answerCbQuery('❌ To\'lov rad etildi!');
    await ctx.editMessageText(
      `${ctx.update.callback_query.message.text}\n\n` +
      `❌ *Rad etildi*\n` +
      `👤 Admin: @${username}\n` +
      `🕒 Sana: ${new Date().toLocaleString()}`,
      { parse_mode: 'Markdown' }
    );
    
    // Foydalanuvchiga xabar
    try {
      await ctx.telegram.sendMessage(
        userId,
        '❌ *To\'lov rad etildi\!*\n\n' +
      '🆔 Buyurtma ID: `' + paymentId + '`\n' +
      '❌ Sabab: To\'lov ma\'lumotlari noto\'g\'ri yoki to\'lov amalga oshirilmagan\.\n\n' +
      'ℹ️ Iltimos, to\'lovni qayta amalga oshiring yoki @d1yor_salee ga murojaat qiling\.',
      { 
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [Markup.button.callback('💳 Qayta to\'lov qilish', 'topup:amount')],
            [Markup.button.callback('📞 Yordam', 'support')]
          ]
        }
      }
      );
    } catch (error) {
      // Don't log error to console, try to send a simpler message
      try {
        await ctx.telegram.sendMessage(
          userId,
          `❌ To'lov rad etildi! Iltimos, @d1yor_salee ga murojaat qiling.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        // Notify admin about the error using escaped text
        await ctx.telegram.sendMessage(
          ADMIN_IDS[0],
          `⚠️ Xatolik: Foydalanuvchiga xabar yuborishda muammo yuz berdi.\nFoydalanuvchi ID: ${userId}`,
          { parse_mode: 'Markdown' }
        );
      }
    }
    
  } catch (error) {
    console.error('To\'lovni rad etishda xatolik:', error);
    try {
      await ctx.answerCbQuery('❌ Xatolik yuz berdi!');
      // Notify admin about the error using escaped text
      // Notify admin about the error
      await ctx.telegram.sendMessage(
        ADMIN_IDS[0],
        `⚠️ Xatolik: To'lovni rad etishda muammo yuz berdi.\nBuyurtma ID: ${paymentId}\nFoydalanuvchi ID: ${userId}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      // If we can't send message to admin, there's not much we can do
    }
  }
});

// Matnli javoblar (Promokod va Admin panel)
// Promokod kiritish bosqichi
bot.action('use_promo', async (ctx) => {
  ctx.session.awaitingPromo = true;
  await ctx.reply('🔑 Promokodni kiriting:');
});

// Promokodni tekshirish
// Function to format card number with spaces (e.g., 8600 1234 5678 9012)
function formatCardNumber(number) {
  if (!number) return '';
  // Remove all non-digit characters
  const digits = number.replace(/\D/g, '');
  // Add space every 4 digits
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

// Function to get formatted card information
function getCardInfo() {
  const cardInfo = {
    owner: process.env.CARD_OWNER || 'Mavjud emas',
    uzcard: process.env.UZCARD_NUMBER ? formatCardNumber(process.env.UZCARD_NUMBER) : 'Mavjud emas',
    humo: process.env.HUMO_NUMBER ? formatCardNumber(process.env.HUMO_NUMBER) : 'Mavjud emas'
  };
  
  cardInfo.formatted = `💳 *Karta ma'lumotlari*\n` +
    `👤 Egasi: ${cardInfo.owner}\n` +
    `💳 Uzcard: \`${cardInfo.uzcard}\`\n` +
    `💳 Humo: \`${cardInfo.humo}\``;
    
  return cardInfo;
}

// Function to get premium prices
function getPremiumPrices() {
  return {
    1: parseInt(process.env.PREMIUM_1_MONTH) || 43000,
    3: parseInt(process.env.PREMIUM_3_MONTHS) || 152000,
    6: parseInt(process.env.PREMIUM_6_MONTHS) || 222000,
    12: parseInt(process.env.PREMIUM_12_MONTHS) || 320000
  };
}

// Function to get stars prices
function getStarsPrices() {
  return {
    15: 3500,   // 15 stars - 3,500 so'm
    25: 6000,   // 25 stars - 6,000 so'm
    50: 12000,  // 50 stars - 12,000 so'm
    100: 22000, // 100 stars - 22,000 so'm
    150: 31000, // 150 stars - 31,000 so'm
    200: 43000, // 200 stars - 43,000 so'm
    300: 63000  // 300 stars - 63,000 so'm
  };
}
// Function to update price in .env
async function updatePrice(type, key, value) {
  try {
    const envVar = `${type.toUpperCase()}_${key}`.toUpperCase();
    const updates = { [envVar]: value };
    await updateEnvFile(updates);
    return true;
  } catch (error) {
    console.error('Error updating price:', error);
    return false;
  }
}

// Function to update .env file
function updateEnvFile(updates) {
  return new Promise((resolve, reject) => {
    try {
      const envPath = path.join(__dirname, '.env');
      
      // Read the file asynchronously
      fs.readFile(envPath, 'utf8', (err, data) => {
        if (err) {
          console.error('Error reading .env file:', err);
          return reject(err);
        }
        
        let envContent = data;
        
        // Update each key-value pair
        Object.entries(updates).forEach(([key, value]) => {
          const regex = new RegExp(`^${key}=.*`, 'm');
          if (envContent.match(regex)) {
            envContent = envContent.replace(regex, `${key}=${value}`);
          } else {
            envContent += `\n${key}=${value}`;
          }
          // Update process.env for current session
          process.env[key] = value;
        });
        
        // Write back to file asynchronously
        fs.writeFile(envPath, envContent, 'utf8', (err) => {
          if (err) {
            console.error('Error writing to .env file:', err);
            return reject(err);
          }
          console.log('Successfully updated .env file');
          resolve();
        });
      });
    } catch (error) {
      console.error('Error in updateEnvFile:', error);
      reject(error);
    }
  });
}

bot.on('text', async (ctx, next) => {
  // Check if admin is editing card info
  if (ctx.session.editingCardField) {
    const field = ctx.session.editingCardField;
    const value = ctx.message.text.trim();
    
    // Basic validation
    if ((field === 'UZCARD_NUMBER' || field === 'HUMO_NUMBER') && !/^\d+$/.test(value)) {
      await ctx.reply('❌ Noto\'g\'ri format! Faqat raqam kiriting.');
      return;
    }
    
    try {
      // Update the .env file
      updateEnvFile({ [field]: value });
      
      // Clear the editing state
      delete ctx.session.editingCardField;
      
      // Send success message and return to card menu
      await ctx.reply(`✅ ${field === 'CARD_OWNER' ? 'Karta egasi' : field === 'UZCARD_NUMBER' ? 'Uzcard raqami' : 'Humo raqami'} muvaffaqiyatli o'zgartirildi!`);
      
      // Show the updated card menu
      const cardInfoText = `💳 *Karta ma'lumotlari*\n` +
        `👤 Egasi: ${process.env.CARD_OWNER || 'Mavjud emas'}\n` +
        `💳 Uzcard: \`${process.env.UZCARD_NUMBER || 'Mavjud emas'}\`\n` +
        `💳 Humo: \`${process.env.HUMO_NUMBER || 'Mavjud emas'}\``;
        
      const cardMenuKeyboard = [
        [Markup.button.callback('✏️ Karta egasini o\'zgartirish', 'admin:editCardOwner')],
        [Markup.button.callback('💳 Uzcard raqamini o\'zgartirish', 'admin:editUzcard')],
        [Markup.button.callback('💳 Humo raqamini o\'zgartirish', 'admin:editHumo')],
        [Markup.button.callback('◀️ Orqaga', 'back:admin')]
      ];
      
      await sendOrUpdateMenu(ctx, cardInfoText, cardMenuKeyboard, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Karta ma\'lumotlarini yangilashda xatolik:', error);
      await ctx.reply('❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    }
    return;
  }
  
  // Check if admin is sending a message to a user
  if (ctx.session.awaitingUserMessage && ctx.session.messageTargetUser) {
    const targetUserId = ctx.session.messageTargetUser;
    const message = ctx.message.text;
    
    try {
      // Try to send the message to the user
      await ctx.telegram.sendMessage(
        targetUserId,
        `📨 *Admin xabari:*\n\n${message}\n\n` +
        `💬 Javob yozish uchun shu xabarga javob bosing.`,
        { parse_mode: 'Markdown' }
      );
      
      // Notify admin of success
      await ctx.reply(`✅ Xabar foydalanuvchiga muvaffaqiyatli yuborildi!`);
      
      // Clean up session
      delete ctx.session.awaitingUserMessage;
      delete ctx.session.messageTargetUser;
      
      // Go back to find user menu
      return sendAdminPanel(ctx);
      
    } catch (error) {
      console.error('Xabar yuborishda xatolik:', error);
      await ctx.reply('❌ Xabar yuborishda xatolik yuz berdi. Foydalanuvchi botni bloklagan yoki botni ishga tushirmagan bo\'lishi mumkin.');
      
      // Clean up session even if there was an error
      delete ctx.session.awaitingUserMessage;
      delete ctx.session.messageTargetUser;
      
      return sendAdminPanel(ctx);
    }
  }
  
  // Promokod kiritishni kutyapmiz
  if (ctx.session.awaitingPromo) {
    const promoCode = ctx.message.text.trim().toUpperCase();
    const userId = ctx.from.id;
    
    // Check if it's a command
    if (promoCode.startsWith('/')) {
      return;
    }
    
    const result = await checkPromoCode(promoCode);
    
    if (result.valid) {
      // Promokod to'g'ri bo'lsa, balansga qo'shamiz
      updateUserBalance(userId, result.amount);
      const used = markPromoCodeAsUsed(promoCode, userId);
      
      if (used) {
        // Foydalanuvchiga xabar beramiz
        await ctx.reply(result.message);
        
        // Yangilangan balansni ko'rsatamiz
        const userBalance = getUserBalance(userId);
        await ctx.reply(`💰 Joriy balans: ${userBalance.toLocaleString()} so'm`);
        
        // Adminlarga xabar beramiz
        const promo = promoCodeStorage.get(promoCode);
        const remainingUses = promo ? promo.usesLeft : 0;
        
        for (const adminId of ADMIN_IDS) {
          try {
            await ctx.telegram.sendMessage(
              adminId,
              `🎫 *Yangi Promokod Ishlatildi*\n\n` +
              `🔑 KOD: *${promoCode}*\n` +
              `👤 Foydalanuvchi: [${ctx.from.first_name}](tg://user?id=${userId}) (ID: ${userId})\n` +
              `💰 Summa: *${result.amount.toLocaleString()} so'm*\n` +
              `🔄 Qolgan foydalanish: *${remainingUses} marta*`,
              { parse_mode: 'Markdown' }
            );
          } catch (error) {
            console.error('Adminlarga xabar yuborishda xatolik:', error);
          }
        }
      } else {
        await ctx.reply('❌ Ushbu promokodni allaqachon ishlatgansiz!');
      }
    } else {
      await ctx.reply(result.message);
    }
    
    ctx.session.awaitingPromo = false;
    return;
  }
  // Check if user is in the process of buying UC/PP
  if (ctx.session.buying && (ctx.session.buying.type === 'pubg_uc' || ctx.session.buying.type === 'pubg_pp')) {
    const { type, amount, price } = ctx.session.buying;
    const username = ctx.message.text.trim();
    const productType = type === 'pubg_uc' ? 'UC' : 'PP';
    const orderId = generateOrderId();
    const userId = ctx.from.id;
    const userBalance = getUserBalance(userId);
    
    // Verify user still has enough balance
    if (userBalance < price) {
      const neededAmount = price - userBalance;
      const keyboard = [
        [Markup.button.callback('💳 Hisobni to\'ldirish', 'topup:amount')],
        [Markup.button.callback('⬅️ Orqaga', `pubg:buy_${type.split('_')[1]}`)]
      ];
      
      return sendOrUpdateMenu(
        ctx,
        `⚠️ *Hisobingizda yetarli mablag' mavjud emas!*\n\n` +
        `💳 Sizning balansingiz: *${userBalance.toLocaleString()} so'm*\n` +
        `💰 Tanlangan paket narxi: *${price.toLocaleString()} so'm*\n` +
        `💵 Yetishmayotgan summa: *${neededAmount.toLocaleString()} so'm*\n\n` +
        `ℹ Iltimos, hisobingizni to'ldiring yoki kichikroq miqdordagi ${productType} tanlang.`,
        keyboard
      );
    }
    
    // Create order object
    const order = {
      type,
      amount,
      price,
      username,
      userId,
      userName: ctx.from.first_name,
      status: 'pending',
      createdAt: new Date()
    };
    
    // Initialize orders object if it doesn't exist
    if (!ctx.session.orders) {
      ctx.session.orders = {};
    }
    
    // Store order in a global object instead of session
    if (!global.orders) {
      global.orders = {};
    }
    
    // Store order with all necessary details
    global.orders[orderId] = {
      ...order,
      orderId: orderId,
      userName: ctx.from.first_name,
      userId: ctx.from.id,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    
    // Also store in session for reference
    if (!ctx.session.myOrders) {
      ctx.session.myOrders = [];
    }
    ctx.session.myOrders.push(orderId);
    
    // Clear buying state
    ctx.session.buying = null;
    
    // Send confirmation to user
    await ctx.replyWithMarkdown(
      `✅ Sotib olish so'rovi qabul qilindi!\n\n` +
      `📦 Mahsulot: *${amount} ${productType}*\n` +
      `👤 O'yinchi: *${username}*\n` +
      `💳 To'lov: *${price.toLocaleString()} so'm*\n` +
      `💰 Joriy balans: *${userBalance.toLocaleString()} so'm*\n\n` +
      `🆔 Buyurtma raqami: *${orderId}*\n` +
      `📞 Aloqa: @d1yor_salee\n\n` +
      `💡 Iltimos, to'lovni tasdiqlash uchun adminlarimiz kuting.`,
      { parse_mode: 'Markdown' }
    );
    
    // Notify admin
    const adminMessage = `🆕 *Yangi PUBG ${productType} Sotuv!*\n\n` +
      `🆔 Buyurtma: #${orderId}\n` +
      `👤 Foydalanuvchi: [${ctx.from.first_name}](tg://user?id=${ctx.from.id}) (ID: ${ctx.from.id})\n` +
      `📱 O'yinchi: *${username}*\n` +
      `📦 Miqdor: *${amount} ${productType}*\n` +
      `💵 Narx: *${price.toLocaleString()} so'm*\n` +
      `💰 Balans: *${userBalance.toLocaleString()} so'm*\n` +
      `⏰ Vaqt: ${new Date().toLocaleString()}`;
    
    // Send to all admins
    for (const adminId of ADMIN_IDS) {
      try {
        await bot.telegram.sendMessage(adminId, adminMessage, { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Tasdiqlash', callback_data: `confirm_pubg:${orderId}:${ctx.from.id}` },
                { text: '❌ Bekor qilish', callback_data: `reject_pubg:${orderId}:${ctx.from.id}` }
              ]
            ]
          }
        });
      } catch (err) {
        console.error(`Failed to send message to admin ${adminId}:`, err);
      }
    }
    
    // Reset session
    ctx.session.buying = null;
    return sendMainMenu(ctx);
  }

  if (ctx.session.awaitingPromo) {
    const code = ctx.message.text.trim();
    ctx.session.awaitingPromo = false;
    // Kodni tekshirish yoki bazaga yozish mumkin
    await ctx.reply(`Promokod qabul qilindi: ${code}`);
    return; // to'xtatamiz
  }

  // Admin: yangi promokod
  if (ctx.session.awaitingNewPromo && isAdmin(ctx)) {
    ctx.session.awaitingNewPromo = false;
    const promo = ctx.message.text.trim();
    // Promokodni saqlash yoki qo'shimcha amallar
    await ctx.reply(`Yangi promokod yaratildi: ${promo}`);
    return;
  }
  // Admin: foydalanuvchi izlash
  if (ctx.session.awaitingFindUser && isAdmin(ctx)) {
    const query = ctx.message.text.trim().toLowerCase();
    ctx.session.awaitingFindUser = false;
    
    try {
      // Try to find user by ID
      let foundUser = null;
      let foundBy = '';
      
      // Check if query is a user ID
      if (/^\d+$/.test(query)) {
        const userId = parseInt(query);
        try {
          const user = await ctx.telegram.getChat(userId);
          foundUser = user;
          foundBy = 'ID';
        } catch (error) {
          // User not found by ID, will search by name/username
        }
      }
      
      // Search for all matching users by username or name
      const allUsers = Array.from(global.botUsers || []);
      const matchingUsers = [];
      
      // If we found by ID, add it to results
      if (foundUser) {
        matchingUsers.push(foundUser);
      }
      
      // Search through all users for matches
      for (const userId of allUsers) {
        try {
          // Skip if this is the user we already found by ID
          if (foundUser && foundUser.id === userId) continue;
          
          const user = await ctx.telegram.getChat(userId);
          const usernameMatch = user.username && user.username.toLowerCase().includes(query);
          const firstNameMatch = user.first_name && user.first_name.toLowerCase().includes(query);
          const lastNameMatch = user.last_name && user.last_name.toLowerCase().includes(query);
          
          if (usernameMatch || firstNameMatch || lastNameMatch) {
            matchingUsers.push(user);
          }
        } catch (error) {
          console.error(`Foydalanuvchi ma'lumotlarini olishda xatolik (${userId}):`, error);
        }
        
        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      
      if (matchingUsers.length > 0) {
        if (matchingUsers.length === 1) {
          // If only one user found, show detailed info
          const user = matchingUsers[0];
          const userId = user.id;
          const userBalance = getUserBalance(userId) || 0;
          
          // Get user's orders count
          const userOrders = global.orders ? 
            Object.values(global.orders).filter(o => o.userId === userId) : [];
          const completedOrders = userOrders.filter(o => o.status === 'completed');
          
          const userInfo = `👤 *Foydalanuvchi ma\'lumotlari*\n\n` +
            `🆔 ID: \`${userId}\`\n` +
            `👤 Ism: ${user.first_name || 'Mavjud emas'} ${user.last_name || ''}\n` +
            `🔗 Username: @${user.username || 'mavjud emas'}\n` +
            `💰 Balans: *${userBalance.toLocaleString()} so'm*\n` +
            `📅 Buyurtmalar: ${completedOrders.length} ta (${userOrders.length} jami)\n` +
            `📊 Umumiy xarajat: ${completedOrders.reduce((sum, o) => sum + (o.price || 0), 0).toLocaleString()} so'm\n\n` +
            `🔍 _Ma\'lumotlar faqat ko'rish uchun_`;
          
          // No interactive buttons, just show the info
          const keyboard = [
            [Markup.button.callback('◀️ Orqaga', 'admin:findUser')]
          ];
          
          // Send the message only to the admin who searched
          if (ctx.chat && ctx.chat.id === ctx.from.id) {
            await sendOrUpdateMenu(ctx, userInfo, keyboard, { 
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            });
          }
        } else {
          // If multiple users found, show list
          let userList = `🔍 *Topilgan foydalanuvchilar (${matchingUsers.length} ta)*\n\n`;
          const userButtons = [];
          
          // Add up to 10 matching users
          for (let i = 0; i < Math.min(matchingUsers.length, 10); i++) {
            const user = matchingUsers[i];
            const userBalance = getUserBalance(user.id) || 0;
            const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Noma\'lum';
            const username = user.username ? `@${user.username}` : 'Noma\'lum';
            
            userList += `👤 *${i+1}.* ${displayName}\n` +
                       `   🔹 ${username} | ${userBalance.toLocaleString()} so'm\n` +
                       `   🔹 ID: \`${user.id}\`\n\n`;
            
            // Add a button for each user
            userButtons.push([
              Markup.button.callback(
                `👤 ${displayName} (${userBalance.toLocaleString()} so'm)`, 
                `admin:view_user:${user.id}`
              )
            ]);
          }
          
          if (matchingUsers.length > 10) {
            userList += `\n...va yana ${matchingUsers.length - 10} ta foydalanuvchi topildi.\n`;
            userList += `Qidiruvni aniqroq qiling.`;
          }
          
          // Add back button
          keyboard.push([Markup.button.callback('◀️ Orqaga', 'admin:findUser')]);
          
          await sendOrUpdateMenu(ctx, userList, keyboard);
        }
      } else {
        await sendOrUpdateMenu(
          ctx,
          `❌ Foydalanuvchi topilmadi\n\n"${query}" bo'yicha hech qanday foydalanuvchi topilmadi.`,
          [
            [Markup.button.callback('🔄 Qayta urinish', 'admin:findUser')],
            [Markup.button.callback('◀️ Orqaga', 'back:admin')]
          ]
        );
      }
    } catch (error) {
      console.error('Foydalanuvchi qidirishda xatolik:', error);
      await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
      await sendAdminPanel(ctx);
    }
    return;
  }
  // Handle promo code creation
  if (ctx.session.creatingPromo) {
    // Skip if it's a command
    if (ctx.message.text.startsWith('/')) {
      // Skip command handling as we're in promo creation mode
      return;
    }
    
    const { step, data } = ctx.session.creatingPromo;
    const text = ctx.message.text.trim();
    
    if (step === 'amount') {
      const amount = parseInt(text);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Noto\'g\'ri summa kiritildi. Iltimos, musbat son kiriting:');
        return;
      }
      
      data.amount = amount;
      ctx.session.creatingPromo.step = 'uses';
      
      await sendOrUpdateMenu(
        ctx,
        `💰 *Summa: ${amount.toLocaleString()} so'm*\n\n` +
        `🔄 Promo kod nechi marta ishlatilishi mumkin?\n` +
        `Iltimos, foydalanishlar sonini kiriting yoki tanlang:`, 
        [
          [Markup.button.callback('1 marta', 'setPromoUses:1')],
          [Markup.button.callback('5 marta', 'setPromoUses:5')],
          [Markup.button.callback('10 marta', 'setPromoUses:10')],
          [Markup.button.callback('◀️ Orqaga', 'admin:promoMenu')]
        ],
        { parse_mode: 'Markdown' }
      );
      return;
    } else if (step === 'uses') {
      const uses = parseInt(text);
      if (isNaN(uses) || uses <= 0) {
        await ctx.reply('❌ Noto\'g\'ri son kiritildi. Iltimos, musbat son kiriting:');
        return;
      }
      
      data.uses = uses;
      ctx.session.creatingPromo.step = 'expiry';
      
      await sendOrUpdateMenu(
        ctx,
        `🔄 *Foydalanishlar soni: ${uses} marta*\n\n` +
        `📅 Promo kod qancha kunga amal qiladi?\n` +
        `Iltimos, muddatni kiriting yoki tanlang:`, 
        [
          [Markup.button.callback('1 kun', 'setPromoExpiry:1')],
          [Markup.button.callback('7 kun', 'setPromoExpiry:7')],
          [Markup.button.callback('30 kun', 'setPromoExpiry:30')],
          [Markup.button.callback('◀️ Orqaga', 'admin:promoMenu')]
        ],
        { parse_mode: 'Markdown' }
      );
      return;
    } else if (step === 'expiry') {
      const days = parseInt(text);
      if (isNaN(days) || days <= 0) {
        await ctx.reply('❌ Noto\'g\'ri kun soni kiritildi. Iltimos, musbat son kiriting:');
        return;
      }
      
      data.expiresInDays = days;
      
      const { amount, uses } = data;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      
      await sendOrUpdateMenu(
        ctx,
        `✅ *Promo kod ma\'lumotlari*\n\n` +
        `💰 Summa: *${amount.toLocaleString()} so'm*\n` +
        `🔄 Foydalanish: *${uses} marta*\n` +
        `📆 Amal qilish muddati: *${days} kun*\n` +
        `📅 Tugash sanasi: *${expiresAt.toLocaleDateString()}*\n\n` +
        `Promo kodni yaratishni tasdiqlaysizmi?`,
        [
          [Markup.button.callback('✅ Tasdiqlash', 'admin:confirmPromo')],
          [Markup.button.callback('❌ Bekor qilish', 'admin:promoMenu')]
        ],
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    await ctx.reply('❌ Noto\'g\'ri miqdor kiritildi. Iltimos, musbat son kiriting.');
    return;
  }
  
  // Admin: broadcast
  if (ctx.session.awaitingBroadcast && ctx.session.broadcastState?.step === 'awaiting_message' && isAdmin(ctx)) {
    const broadcastText = ctx.message.text;
    
    // Store the broadcast message in session
    ctx.session.broadcastState = {
      step: 'confirm_send',
      message: broadcastText,
      messageIds: {}
    };
    
    // Show confirmation with cancel button
    const keyboard = [
      [
        Markup.button.callback('✅ Xabarni yuborish', 'confirm_broadcast'),
        Markup.button.callback('❌ Bekor qilish', 'cancel_broadcast')
      ]
    ];
    
    await sendOrUpdateMenu(
      ctx,
      `📝 *Xabar matni:*\n\n${broadcastText}\n\n` +
      `Ushbu xabarni barcha foydalanuvchilarga yuborishni tasdiqlaysizmi?`,
      keyboard
    );
    
    return;
  }
  
  return next();
});

// /start komandasi uchun handler
bot.command('start', async (ctx) => {
  try {
    // Avval obunani tekshirish
    const checkResult = await checkUserSubscription(ctx);
    
    // Agar obuna bo'lmagan bo'lsa, obuna bo'lish sahifasiga yo'naltirish
    if (!checkResult.subscribed) {
      return await sendSubscriptionMessage(ctx, checkResult);
    }
    
    // Aks holda asosiy menyuni ko'rsatish
    return await sendMainMenu(ctx);
  } catch (error) {
    console.error('Start command error:', error);
    await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Obunani tekshirish
bot.action('check_subscription', async (ctx) => {
  try {
    const isSubscribed = await checkUserSubscription(ctx);
    
    if (isSubscribed) {
      await ctx.answerCbQuery('✅ Siz barcha kanallarga obuna bo\'lgansiz!');
      return await sendMainMenu(ctx);
    } else {
      await ctx.answerCbQuery('❌ Iltimos, barcha kanallarga obuna bo\'ling!');
      return await sendSubscriptionMessage(ctx);
    }
  } catch (error) {
    console.error('Obunani tekshirishda xatolik:', error);
    await ctx.answerCbQuery('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Har bir xabar uchun obunani tekshirish
bot.use(async (ctx, next) => {
  // Agar bu obunani tekshirish yoki kanalga o'tish bo'lsa, o'tkazib yuboramiz
  if (ctx.callbackQuery?.data === 'check_subscription' || 
      ctx.callbackQuery?.data?.startsWith('http')) {
    return next();
  }
  
  // Agar admin bo'lsa, tekshirmaymiz
  if (isAdmin(ctx)) {
    return next();
  }
  
  // Obunani tekshirish
  const isSubscribed = await checkUserSubscription(ctx);
  
  if (!isSubscribed) {
    // Agar obuna bo'lmagan bo'lsa, obuna bo'lish sahifasiga yo'naltiramiz
    return await sendSubscriptionMessage(ctx);
  }
  
  // Aks holda keyingi middlewarega o'tamiz
  return next();
});

// Kanal ma'lumotlarini o'qish
function getChannels() {
  const channels = [];
  let i = 1;
  
  while (process.env[`CHANNEL_${i}_USERNAME`] && process.env[`CHANNEL_${i}_LINK`]) {
    channels.push({
      username: process.env[`CHANNEL_${i}_USERNAME`].replace('@', ''), // @ belgisini olib tashlaymiz
      link: process.env[`CHANNEL_${i}_LINK`]
    });
    i++;
  }
  
  return channels;
}

// Foydalanuvchi kanallarga obuna bo'lganligini tekshirish
async function checkUserSubscription(ctx) {
  try {
    const userId = ctx.from.id;
    const channels = getChannels();
    
    // Agar kanallar mavjud bo'lmasa, obunani tekshirish shart emas
    if (channels.length === 0) {
      console.log('Obunani tekshirish o\'chirilgan - kanallar mavjud emas');
      return { subscribed: true, channels: [] };
    }
    
    const unsubscribedChannels = [];
    let hasAccessError = false;
    
    for (const channel of channels) {
      try {
        // Kanal username orqali chat ma'lumotlarini olamiz
        const chat = await ctx.telegram.getChat(`@${channel.username}`);
        const member = await ctx.telegram.getChatMember(chat.id, userId);
        
        if (!['member', 'administrator', 'creator'].includes(member.status)) {
          console.log(`Foydalanuvchi ${userId} @${channel.username} kanaliga obuna emas`);
          unsubscribedChannels.push(channel);
        }
      } catch (error) {
        console.error(`Kanalni tekshirishda xatolik (@${channel.username}):`, error);
        
        // If we can't access member list, we'll assume the user is not subscribed
        if (error.code === 400 && error.description.includes('member list is inaccessible')) {
          console.log(`Bot @${channel.username} kanalining a'zolar ro'yxatini ko'rolmadi. Iltimos, botni kanalga admin qiling.`);
          unsubscribedChannels.push(channel);
          hasAccessError = true;
        }
        continue;
      }
    }
    
    return { 
      subscribed: unsubscribedChannels.length === 0,
      channels: unsubscribedChannels,
      hasAccessError
    };
  } catch (error) {
    console.error('Obunani tekshirishda xatolik:', error);
    return { 
      subscribed: true, // Xatolik bo'lsa ham foydalanuvchiga ruxsat beramiz
      channels: [],
      hasAccessError: true
    };
  }
};

// Obuna bo'lish tugmasi bilan xabar yuborish
const sendSubscriptionMessage = async (ctx, checkResult = null) => {
  try {
    const channels = checkResult?.channels?.length > 0 ? checkResult.channels : getChannels();
    
    // Agar kanallar mavjud bo'lmasa, asosiy menyuga qaytamiz
    if (channels.length === 0) {
      console.log('Obuna xabari yuborilmadi - kanallar mavjud emas');
      return await sendMainMenu(ctx);
    }
    
    let message = '⚠️ *Diqqat!*\n\n';
    
    // Add warning if there was an access error
    if (checkResult?.hasAccessError) {
      message += '❗ *Diqqat!* Bot ba\'zi kanallarga kirish huquqiga ega emas. ';
      message += 'Iltimos, botni kanalga admin qiling yoki admin bilan bog\'laning.\n\n';
    }
    
    message += 'Botdan to\'liq foydalanish uchun quyidagi kanallarga a\'zo bo\'ling:\n\n';
    
    // Create inline keyboard with channel buttons
    const inlineKeyboard = [];
    
    // Add each channel as an inline URL button
    channels.forEach(channel => {
      inlineKeyboard.push([
        { text: `📢 ${channel.username} kanali`, url: channel.link }
      ]);
    });
    
    // Add check subscription button
    inlineKeyboard.push([
      { text: '✅ Obunani tekshirish', callback_data: 'check_subscription' }
    ]);
    
    // Send the message with inline keyboard
    try {
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        message + 'Quyidagi tugmalar orqali kanallarga obuna bo\'ling:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: inlineKeyboard
          }
        }
      );
    } catch (error) {
      console.error('Xabar yuborishda xatolik:', error);
      // Fallback to old method if inline keyboard fails
      const buttons = channels.map(channel => [
        Markup.button.url(`📢 ${channel.username} kanaliga obuna bo'lish`, channel.link)
      ]);
      buttons.push([Markup.button.callback('✅ Obunani tekshirish', 'check_subscription')]);
      
      await sendOrUpdateMenu(
        ctx,
        message + 'Quyidagi kanallarga obuna bo\'ling:',
        buttons
      );
    }
  } catch (error) {
    console.error('Obuna xabarini yuborishda xatolik:', error);
    // Xatolik yuz berganda ham foydalanuvchiga tushunarli xabar qaytaramiz
    await ctx.reply('Kechirasiz, xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko\'ring.');
    
    // Agar xatolik yuz bersa ham asosiy menyuni ko'rsatamiz
    try {
      await sendMainMenu(ctx);
    } catch (e) {
      console.error('Asosiy menyuni yuborishda xatolik:', e);
    }
  }
};

// Admin PUBG buyurtmasini tasdiqlash
bot.action(/confirm_pubg:(\w+):(\d+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }

  const orderId = ctx.match[1];
  const userId = parseInt(ctx.match[2]);
  
  try {
    // Get order details from database
    // const order = await getOrder(orderId);
    // if (!order) {
    //   return await ctx.answerCbQuery('Buyurtma topilmadi!');
    // }
    
    // Get order from global storage
    if (!global.orders || !global.orders[orderId]) {
      return await ctx.answerCbQuery('Buyurtma ma\'lumotlari topilmadi! Iltimos, foydalanuvchi qaytadan buyurtma bersin.');
    }
    
    const order = global.orders[orderId];
    
    // Check if order is already processed
    if (order.status === 'completed') {
      return await ctx.answerCbQuery('Bu buyurtma allaqachon bajarilgan!');
    }
    
    const { type, amount, price, username } = order;
    const productType = type === 'pubg_uc' ? 'UC' : 'PP';
    
    // Get current user balance
    const userBalance = getUserBalance(userId);
    
    // Check if user still has enough balance
    if (userBalance < price) {
      await ctx.answerCbQuery('Foydalanuvchida yetarli mablag\' mavjud emas!');
      return await ctx.editMessageText(
        `❌ *Balans yetarli emas!*\n` +
        `👤 Foydalanuvchi: [${order.userName || 'Noma\'lum'}](tg://user?id=${userId})\n` +
        `💰 Kerak: ${price.toLocaleString()} so'm\n` +
        `💳 Mavjud: ${userBalance.toLocaleString()} so'm\n` +
        `📦 Buyurtma: ${amount} ${productType}\n` +
        `🆔 Buyurtma: #${orderId}\n\n` +
        `❌ Iltimos, foydalanuvchiga xabar bering!`,
        { parse_mode: 'Markdown' }
      );
    }
    
    // Deduct balance
    updateUserBalance(userId, -price);
    
    // Update order status in global storage
    if (global.orders && global.orders[orderId]) {
      global.orders[orderId].status = 'completed';
      global.orders[orderId].completedAt = new Date().toISOString();
      global.orders[orderId].completedBy = ctx.from.id;
    }
    
    // Notify user
    await bot.telegram.sendMessage(
      userId,
      `✅ Sizning #${orderId} raqamli buyurtmangiz tasdiqlandi!\n\n` +
      `📦 Mahsulot: *${amount} ${productType}*\n` +
      `👤 O'yinchi: *${username}*\n` +
      `💳 To'lov: *${price.toLocaleString()} so'm*\n` +
      `💰 Qolgan balans: *${(userBalance - price).toLocaleString()} so'm*\n\n` +
      `📦 Buyurtmangiz tez orada yetkazib beriladi.\n` +
      `📞 Savollar bo'lsa: @d1yor_salee`,
      { parse_mode: 'Markdown' }
    );
    
    // Update admin message
    await ctx.answerCbQuery('✅ Buyurtma tasdiqlandi!');
    await ctx.editMessageText(
      `✅ *Buyurtma tasdiqlandi*\n` +
      `🆔 Buyurtma: #${orderId}\n` +
      `👤 Foydalanuvchi: [${order.userName || 'Noma\'lum'}](tg://user?id=${userId})\n` +
      `💰 Summa: ${price.toLocaleString()} so'm\n` +
      `📦 Miqdor: ${amount} ${productType}\n` +
      `👤 Admin: ${ctx.from.first_name}\n` +
      `⏰ Vaqt: ${new Date().toLocaleString()}`,
      { 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] } // Remove buttons after confirmation
      }
    );
    
    // Remove order from session
    if (ctx.session.orders && ctx.session.orders[orderId]) {
      delete ctx.session.orders[orderId];
    }
    
  } catch (error) {
    console.error('Tasdiqlashda xatolik:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi!');
  }
});

// Admin PUBG buyurtmasini bekor qilish
bot.action(/reject_pubg:(\w+):(\d+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }

  const orderId = ctx.match[1];
  const userId = ctx.match[2];
  
  try {
    // Get order from global storage
    if (!global.orders || !global.orders[orderId]) {
      return await ctx.answerCbQuery('Buyurtma topilmadi!');
    }
    
    const order = global.orders[orderId];
    
    // Update order status in global storage
    if (global.orders[orderId]) {
      global.orders[orderId].status = 'rejected';
      global.orders[orderId].rejectedAt = new Date().toISOString();
      global.orders[orderId].rejectedBy = ctx.from.id;
    }
    
    // Notify user
    try {
      await bot.telegram.sendMessage(
        userId,
        `❌ Sizning #${orderId} raqamli buyurtmangiz bekor qilindi!\n` +
        `📦 Mahsulot: *${order.amount} ${order.type === 'pubg_uc' ? 'UC' : 'PP'}*\n` +
        `💰 Summa: *${order.price.toLocaleString()} so'm*\n` +
        `⏰ Sana: ${new Date().toLocaleString()}\n\n` +
        `ℹ Sabab: Admin tomonidan bekor qilindi\n` +
        `📞 Savollar bo'lsa: @d1yor_salee`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Foydalanuvchiga xabar yuborishda xatolik:', error);
    }
    
    // Update admin message
    await ctx.answerCbQuery('✅ Buyurtma bekor qilindi!');
    await ctx.editMessageText(
      `❌ *Buyurtma bekor qilindi*\n` +
      `🆔 Buyurtma: #${orderId}\n` +
      `👤 Foydalanuvchi: [${order.userName || 'Noma\'lum'}](tg://user?id=${userId})\n` +
      `📦 Mahsulot: ${order.amount} ${order.type === 'pubg_uc' ? 'UC' : 'PP'}\n` +
      `💰 Summa: ${order.price.toLocaleString()} so'm\n` +
      `👤 Admin: ${ctx.from.first_name}\n` +
      `⏰ Vaqt: ${new Date().toLocaleString()}`,
      { 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] } // Remove buttons after rejection
      }
    );
  } catch (error) {
    console.error('Bekor qilishda xatolik:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi!');
  }
});

// Admin buyurtmani tasdiqlash (inline button orqali)
bot.action(/confirm_order:(\w+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }
  
  const orderId = ctx.match[1];
  const order = pendingOrders[orderId];
  
  if (!order) {
    await ctx.answerCbQuery('Buyurtma topilmadi yoki allaqachon bajarilgan!');
    return;
  }
  
  const { userId, type, amount, username, price } = order;
  
  try {
    // Foydalanuvchi balansini tekshirish
    const userBalance = getUserBalance(userId);
    
    if (userBalance < price) {
      await ctx.reply(`❌ Xatolik! Foydalanuvchida yetarli mablag' yo'q.\n` +
        `Balans: ${userBalance.toLocaleString()} so'm\n` +
        `Kerak: ${price.toLocaleString()} so'm`);
      return;
    }
    
    // Balansdan pul yechish
    updateUserBalance(userId, -price);
    
    // Foydalanuvchiga xabar
    const userMessage = `✅ Sizning buyurtmangiz tasdiqlandi!\n\n` +
      `📦 Turi: ${type === 'premium' ? 'Telegram Premium' : 'Telegram Stars'}\n` +
      `🔢 Miqdor: ${amount} ${type === 'premium' ? 'oy' : 'stars'}\n` +
      `💰 Hisobingizdan yechildi: ${price.toLocaleString()} so'm\n\n` +
      `📝 Iltimos, kuting. Tez orada sizga yuboriladi.`;
    
    await ctx.telegram.sendMessage(userId, userMessage);
    
    // Buyurtmani o'chirish
    delete pendingOrders[orderId];
    
    await ctx.reply(`✅ Buyurtma tasdiqlandi va foydalanuvchi hisobidan ${price.toLocaleString()} so'm yechib olindi.`);
    
  } catch (error) {
    console.error('Buyurtmani tasdiqlashda xatolik:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi: ' + error.message);
  }
});

// Admin buyurtmani bekor qilish (inline button orqali)
bot.action(/cancel_order:(\w+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('Ruxsat yo\'q!');
    return;
  }
  
  const orderId = ctx.match[1];
  const order = pendingOrders[orderId];
  
  if (!order) {
    await ctx.answerCbQuery('Buyurtma topilmadi!');
    return;
  }
  
  const { userId, type, amount, username, price } = order;
  
  try {
    // Foydalanuvchiga xabar
    await ctx.telegram.sendMessage(
      userId,
      `❌ Sizning buyurtmangiz bekor qilindi!\n\n` +
      `📦 Turi: ${type === 'premium' ? 'Telegram Premium' : 'Telegram Stars'}\n` +
      `🔢 Miqdor: ${amount} ${type === 'premium' ? 'oy' : 'stars'}\n` +
      `💰 Summa: ${price.toLocaleString()} so'm\n\n` +
      `ℹ️ Iltimos, qaytadan urinib ko'ring yoki admin bilan bog'laning.`
    );
    
    // Buyurtmani o'chirish
    delete pendingOrders[orderId];
    
    // Xabarni yangilash
    await ctx.editMessageText(
      `${ctx.update.callback_query.message.text}\n\n` +
      `❌ *Bekor qilindi*\n` +
      `👤 Admin: @${ctx.from.username || 'noma\'lum'}\n` +
      `🕒 Sana: ${new Date().toLocaleString()}`,
      { parse_mode: 'Markdown' }
    );
    
    await ctx.answerCbQuery('✅ Buyurtma bekor qilindi!');
  } catch (error) {
    console.error('Buyurtmani bekor qilishda xatolik:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi!');
  }
});

// Admin buyurtmani bekor qilish (eski usul - command orqali)
bot.command(/cancel_(\w+)/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('Sizda ruxsat yo\'q!');
    return;
  }
  
  const orderId = ctx.match[1];
  const order = pendingOrders[orderId];
  
  if (!order) {
    await ctx.reply('Buyurtma topilmadi!');
    return;
  }
  
  const { userId, type, amount, price } = order;
  
  try {
    // Foydalanuvchiga xabar
    await ctx.telegram.sendMessage(
      userId,
      `❌ Sizning buyurtmangiz bekor qilindi!\n\n` +
      `📦 Turi: ${type === 'premium' ? 'Telegram Premium' : 'Telegram Stars'}\n` +
      `🔢 Miqdor: ${amount} ${type === 'premium' ? 'oy' : 'stars'}\n` +
      `💰 Summa: ${price.toLocaleString()} so'm\n\n` +
      `ℹ️ Iltimos, qaytadan urinib ko'ring yoki admin bilan bog'laning.`
    );
    
    // Buyurtmani o'chirish
    delete pendingOrders[orderId];
    
    await ctx.reply('✅ Buyurtma bekor qilindi!');
  } catch (error) {
    console.error('Buyurtmani bekor qilishda xatolik:', error);
    await ctx.reply('Xatolik yuz berdi: ' + error.message);
  }
});

// Orqaga tugmasi bosilganda (asosiy menyuga qaytish)
bot.action('back:main', async (ctx) => {
  try {
    // Avvalgi xabarni o'chirishga harakat qilamiz
    try {
      await ctx.deleteMessage();
    } catch (e) {
      // Xatoni e'tiborsiz qoldiramiz
    }
    // Asosiy menyuni yuboramiz
    await sendMainMenu(ctx);
  } catch (error) {
    console.error('Orqaga qaytishda xatolik:', error);
  }
});

// Handle premium purchase
bot.action(/^buy:premium:(\d+):(\d+)$/, async (ctx) => {
  try {
    const months = parseInt(ctx.match[1]);
    const price = parseInt(ctx.match[2]);
    const userId = ctx.from.id;
    const username = ctx.from.username || 'Noma\'lum';
    
    // Check user balance
    const userBalance = await getUserBalance(userId);
    if (userBalance < price) {
      const needed = price - userBalance;
      await ctx.answerCbQuery(`❌ Yetarli mablag' mavjud emas. Sizga yana ${needed.toLocaleString()} so'm kerak.`);
      return;
    }
    
    // Ask for username
    ctx.session.purchase = {
      type: 'premium',
      amount: months,
      price: price,
      step: 'username'
    };
    
    await ctx.answerCbQuery();
    await ctx.reply(`📱 Telegram Premium ${months} oy uchun ${price.toLocaleString()} so'm\n\nIltimos, Premium qo'shiladigan Telegram foydalanuvchi nomini (@username yoki telefon raqam) yuboring:`);
  } catch (error) {
    console.error('Premium purchase error:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Handle stars purchase
bot.action(/^buy:stars:(\d+):(\d+)$/, async (ctx) => {
  try {
    const stars = parseInt(ctx.match[1]);
    const price = parseInt(ctx.match[2]);
    const userId = ctx.from.id;
    const username = ctx.from.username || 'Noma\'lum';
    
    // Check user balance
    const userBalance = await getUserBalance(userId);
    if (userBalance < price) {
      const needed = price - userBalance;
      await ctx.answerCbQuery(`❌ Yetarli mablag' mavjud emas. Sizga yana ${needed.toLocaleString()} so'm kerak.`);
      return;
    }
    
    // Ask for username
    ctx.session.purchase = {
      type: 'stars',
      amount: stars,
      price: price,
      step: 'username'
    };
    
    await ctx.answerCbQuery();
    await ctx.reply(`⭐ ${stars} Stars uchun ${price.toLocaleString()} so'm\n\nIltimos, Stars qo'shiladigan Telegram foydalanuvchi nomini (@username) yuboring:`);
  } catch (error) {
    console.error('Stars purchase error:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Premium/Stars orqaga tugmasi (asosiy Premium/Stars menyusiga qaytish)
bot.action('back:premium_stars', async (ctx) => {
  try {
    const keyboard = [
      [Markup.button.callback('📱 Telegram Premium', 'premium:select')],
      [Markup.button.callback('⭐ Telegram Stars', 'stars:select')],
      [Markup.button.callback('⬅️ Asosiy menyu', 'back:main')]
    ];
    await sendOrUpdateMenu(ctx, 'Qaysi xizmatni sotib olmoqchisiz?', keyboard);
  } catch (error) {
    console.error('Error in back:premium_stars:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Text message handler for purchase username input and other text inputs
bot.on('text', async (ctx, next) => {
  try {
    console.log('Text message received:', ctx.message.text);
    console.log('Current session:', JSON.stringify(ctx.session, null, 2));
    
    // Initialize session if it doesn't exist
    if (!ctx.session) {
      ctx.session = {};
      console.log('Initialized new session');
    }
    
    // Handle purchase username input
    if (ctx.session.purchase && ctx.session.purchase.step === 'username') {
      console.log('Processing purchase with session data:', JSON.stringify(ctx.session.purchase, null, 2));
      try {
        const { type, amount, price } = ctx.session.purchase;
        const username = ctx.message.text.trim();
        const userId = ctx.from.id;
        const user = ctx.from.username || 'Noma\'lum';
        
        console.log('Processing purchase:', { type, amount, price, username });
        
        // Validate username
        if (!username) {
          await ctx.reply('Iltimos, to\'g\'ri foydalanuvchi nomini kiriting.');
          return;
        }
        
        // Check balance again before proceeding
        const userBalance = await getUserBalance(userId);
        if (userBalance < price) {
          const needed = price - userBalance;
          await ctx.reply(`❌ Yetarli mablag' mavjud emas. Sizga yana ${needed.toLocaleString()} so'm kerak.`);
          delete ctx.session.purchase;
          return await sendMainMenu(ctx);
        }
        
        // Deduct balance
        await updateUserBalance(userId, -price);
        
        // Create order ID
        const orderId = 'ORD-' + Date.now();
        
        // Notify user
        await ctx.reply(`✅ Sotib olish muvaffaqiyatli amalga oshirildi!\n\n` +
          `📝 Buyurtma ma\'lumotlari:\n` +
          `🆔 Buyurtma ID: ${orderId}\n` +
          `📦 Mahsulot: ${type === 'premium' ? `Telegram Premium ${amount} oy` : `${amount} Stars`}\n` +
          `👤 Foydalanuvchi: ${username}\n` +
          `💰 Narxi: ${price.toLocaleString()} so'm\n\n` +
          `Ishonch xizmati: @d1yor_salee`);
        
        // Store the order information for admin confirmation
        const order = {
          id: orderId,
          userId,
          username: user,
          type,
          amount,
          price,
          targetUsername: username,
          timestamp: new Date().toISOString(),
          status: 'pending'
        };
        
        // Store the order
        if (!global.pendingOrders) {
          global.pendingOrders = {};
        }
        global.pendingOrders[orderId] = order;
        
        // Notify admin with confirmation buttons
        try {
          const adminMessage = `🛒 *Yangi sotib olish*\n` +
            `🆔 Buyurtma ID: ${orderId}\n` +
            `👤 Foydalanuvchi: [${user}](tg://user?id=${userId}) (ID: ${userId})\n` +
            `📦 Mahsulot: ${type === 'premium' ? `Telegram Premium ${amount} oy` : `${amount} Stars`}\n` +
            `👥 Foydalanuvchi: ${username}\n` +
            `💰 Narxi: ${price.toLocaleString()} so'm`;
          
          const adminKeyboard = {
            inline_keyboard: [
              [
                { text: '✅ Tasdiqlash', callback_data: `admin_confirm:${orderId}` },
                { text: '❌ Bekor qilish', callback_data: `admin_cancel:${orderId}` }
              ]
            ]
          };
          
          for (const adminId of ADMIN_IDS) {
            try {
              // First try with MarkdownV2
              await ctx.telegram.sendMessage(
                adminId, 
                adminMessage,
                { 
                  parse_mode: 'MarkdownV2',
                  reply_markup: adminKeyboard,
                  disable_web_page_preview: true
                }
              ).catch(async markdownError => {
                console.error(`MarkdownV2 failed for admin ${adminId}:`, markdownError);
                // Fallback to plain text if MarkdownV2 fails
                await ctx.telegram.sendMessage(
                  adminId,
                  `🛒 Yangi sotib olish\n` +
                  `🆔 Buyurtma ID: ${orderId}\n` +
                  `👤 Foydalanuvchi: @${user} (ID: ${userId})\n` +
                  `📦 Mahsulot: ${type === 'premium' ? 'Telegram Premium ' + amount + ' oy' : amount + ' Stars'}\n` +
                  `👥 Foydalanuvchi: ${username}\n` +
                  `💰 Narxi: ${price.toLocaleString()} so'm`,
                  { 
                    reply_markup: adminKeyboard,
                    disable_web_page_preview: true 
                  }
                );
              });
              
              console.log(`Notification with buttons sent to admin ${adminId}`);
            } catch (error) {
              console.error(`Failed to notify admin ${adminId}:`, error);
            }
          }
        } catch (error) {
          console.error('Error in admin notification:', error);
        }
        
        // Clear purchase session
        delete ctx.session.purchase;
        
        // Return to main menu
        await sendMainMenu(ctx);
        
      } catch (error) {
        console.error('Purchase processing error:', error);
        await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
        if (ctx.session?.purchase) {
          delete ctx.session.purchase;
        }
        await sendMainMenu(ctx);
      }
      return;
    }
    
    // Handle price updates
    if (ctx.session?.editingPrice) {
      const { type, key } = ctx.session.editingPrice;
    const priceText = ctx.message.text.trim();
    
    // Validate price input
    const price = parseInt(priceText.replace(/\D/g, ''));
    if (isNaN(price) || price <= 0) {
      await ctx.reply('❌ Iltimos, to\'g\'ri summa kiriting!');
      return;
    }
    
    try {
      // Show typing action to indicate processing
      await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
      
      // Update the price
      const success = await updatePrice(type, key, price);
      
      if (!success) {
        throw new Error('Narxni yangilashda xatolik yuz berdi');
      }
      
      // Clear the editing state
      delete ctx.session.editingPrice;
      
      // Show success message
      let itemName = '';
      let backButton = 'admin:priceMenu';
      
      switch (type) {
        case 'stars':
          itemName = `${key} ta Stars`;
          backButton = 'admin:starsPrices';
          break;
        case 'premium':
          itemName = `${key} oylik Premium`;
          backButton = 'admin:premiumPrices';
          break;
        case 'uc':
          itemName = `${key} UC`;
          backButton = 'admin:ucPrices';
          break;
        case 'pp':
          itemName = `${key} PP`;
          backButton = 'admin:ppPrices';
          break;
        case 'ff':
          itemName = `${key} Diamond`;
          backButton = 'admin:ffPrices';
          break;
        default:
          itemName = `${key}`;
      }
      
      await ctx.reply(`✅ ${itemName} narxi ${price.toLocaleString()} so'mga yangilandi!`);
      
      // Return to the appropriate menu
      if (isAdmin(ctx)) {
        let keyboard = [];
        let menuText = '';
        
        switch (type) {
          case 'uc':
          case 'pp':
          case 'ff':
            // Game prices menu
            const ucPrices = getUcPrices();
            const ppPrices = getPpPrices();
            const ffPrices = getFfPrices();
            
            menuText = '🎮 *O\'yin narxlari*\n\n';
            
            menuText += '🎮 *PUBG UC Narxlari*\n';
            for (const [amount, price] of Object.entries(ucPrices)) {
              menuText += `🔹 ${amount} UC: ${price.toLocaleString()} so'm\n`;
            }
            
            menuText += '\n🎖️ *PUBG PP Narxlari*\n';
            for (const [amount, price] of Object.entries(ppPrices)) {
              menuText += `🔹 ${amount} PP: ${price.toLocaleString()} so'm\n`;
            }
            
            menuText += '\n🔥 *Free Fire Diamond Narxlari*\n';
            for (const [amount, price] of Object.entries(ffPrices)) {
              menuText += `🔹 ${amount} Diamond: ${price.toLocaleString()} so'm\n`;
            }
            
            keyboard = [
              [
                Markup.button.callback('✏️ PUBG UC', 'admin:ucPrices'),
                Markup.button.callback('✏️ PUBG PP', 'admin:ppPrices')
              ],
              [
                Markup.button.callback('✏️ Free Fire', 'admin:ffPrices')
              ],
              [
                Markup.button.callback('◀️ Orqaga', 'admin:priceMenu')
              ]
            ];
            break;
            
          case 'stars':
          case 'premium':
          default:
            // Premium/Stars menu
            const starsPrices = getStarsPrices();
            const premiumPrices = getPremiumPrices();
            
            menuText = '💰 *Barcha narxlar*\n\n';
            
            menuText += '⭐ *Stars narxlari*\n';
            for (const [count, price] of Object.entries(starsPrices)) {
              menuText += `🔹 ${count} ta: ${price.toLocaleString()} so'm\n`;
            }
            
            menuText += '\n🎖️ *Premium narxlari*\n';
            for (const [months, price] of Object.entries(premiumPrices)) {
              menuText += `🔹 ${months} oy: ${price.toLocaleString()} so'm\n`;
            }
            
            keyboard = [
              [
                Markup.button.callback('✏️ Stars', 'admin:starsPrices'),
                Markup.button.callback('✏️ Premium', 'admin:premiumPrices')
              ],
              [
                Markup.button.callback('✏️ PUBG UC', 'admin:ucPrices'),
                Markup.button.callback('✏️ PUBG PP', 'admin:ppPrices')
              ],
              [
                Markup.button.callback('✏️ Free Fire', 'admin:ffPrices')
              ],
              [
                Markup.button.callback('◀️ Orqaga', 'back:admin')
              ]
            ];
        }
        
        await ctx.telegram.sendMessage(
          ctx.chat.id, 
          menuText, 
          {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
          }
        );
      }
    } catch (error) {
      console.error('Error updating price:', error);
      await ctx.reply('❌ Narxni yangilashda xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
    }
    return;
  }
  
  // Handle card information updates
  if (ctx.session && ctx.session.editingCard) {
    const { field } = ctx.session.editingCard;
    
    // Validate input
    if (field === 'uzcard' || field === 'humo') {
      // Remove all non-digit characters
      const cardNumber = ctx.message.text.replace(/\D/g, '');
      
      if (cardNumber.length < 16) {
        await ctx.reply('❌ Karta raqami 16 ta raqamdan iborat bo\'lishi kerak!');
        return;
      }
      
      // Update the card number with proper formatting
      await updateEnvFile({ [field === 'uzcard' ? 'UZCARD_NUMBER' : 'HUMO_NUMBER']: cardNumber });
      await ctx.reply(`✅ ${field === 'uzcard' ? 'Uzcard' : 'Humo'} raqami yangilandi!`);
    } else if (field === 'owner') {
      // Update card owner name
      await updateEnvFile({ CARD_OWNER: ctx.message.text });
      await ctx.reply('✅ Karta egasi ismi yangilandi!');
    }
    
    // Clear the editing state
    delete ctx.session.editingCard;
    
    // Show the card menu again
    if (isAdmin(ctx)) {
      await showCardMenu(ctx);
    }
    return;
  }
  
  // If we reach here, it means the message wasn't handled by any of the previous conditions
  // and we should pass it to the next middleware if it exists
  if (typeof next === 'function') {
    return next();
  }
  return; // End middleware chain if next is not available
  
  } catch (error) {
    console.error('Error in text message handler:', error);
    if (typeof next === 'function') {
      return next();
    }
  }
});

// O'yin narxlari menyusi va handlerlari o'chirildi

 // Launch the bot only in polling mode when webhook is not configured
 const hasWebhookBaseUrl = !!(process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL);
 let BOT_LAUNCHED = false;
 if (!hasWebhookBaseUrl) {
   bot.launch()
     .then(() => {
       BOT_LAUNCHED = true;
       console.log('Bot launched in polling mode');
     })
     .catch((err) => {
       console.error('Failed to launch bot in polling mode:', err);
     });
 }

  // Graceful shutdown
 process.once('SIGINT', () => {
   try {
     if (BOT_LAUNCHED) bot.stop('SIGINT');
   } catch (e) {
     console.error('Error stopping bot on SIGINT:', e);
   }
 });
 process.once('SIGTERM', () => {
   try {
     if (BOT_LAUNCHED) bot.stop('SIGTERM');
   } catch (e) {
     console.error('Error stopping bot on SIGTERM:', e);
   }
 });

 // Export bot for server.js to attach webhook
 module.exports = bot;
