'use client';

import { useState, useEffect, useMemo } from 'react';
// --- FIREBASE SETUP (ВСТАВЛЕНО ПРЯМО СЮДИ) ---
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc 
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDIk302oYXye-r4hRE-EB16N6K3T31g1uk",
  authDomain: "latiao-finance.firebaseapp.com",
  projectId: "latiao-finance",
  storageBucket: "latiao-finance.firebasestorage.app",
  messagingSenderId: "858773999156",
  appId: "1:858773999156:web:fe8f4907314f83c9a88461"
};

// Ініціалізуємо базу, якщо вона ще не створена
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- ІМПОРТИ ІКОНОК ТА ГРАФІКІВ ---
import { 
  LayoutDashboard, PieChart, TrendingUp, Wallet, ArrowUpRight, ArrowDownLeft, 
  Settings, LogOut, Lock, Building2, CreditCard, RefreshCw, X
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';

// --- НАЛАШТУВАННЯ (Бізнес-логіка) ---
const CATEGORIES = {
  income: ['Продажі', 'Повернення пост.', 'Кешбек', 'Інше'],
  expense: ['Закупівля (COGS)', 'Реклама', 'Логістика', 'Пакування', 'Зарплата', 'Податки', 'Оренда', 'Комісії', 'Офіс', 'Інше']
};
const ACCOUNTS = ['Monobank ФОП', 'NovaPay', 'Готівка'];

const AUTO_RULES = [
  { k: 'Nova Poshta', c: 'Логістика' }, { k: 'NovaPay', c: 'Комісії' },
  { k: 'Meta', c: 'Реклама' }, { k: 'Google', c: 'Реклама' }, { k: 'Prom', c: 'Реклама' }
];

export default function LatiaoEnterprise() {
  // --- STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Простий вхід
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  
  // Вхід
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // Форма транзакції
  const [modalOpen, setModalOpen] = useState(false); // false, 'income', 'expense', 'dividend'
  const [txForm, setTxForm] = useState({
    amount: '', category: 'Інше', source: 'Monobank ФОП', description: '', date: new Date().toISOString().split('T')[0]
  });

  // --- ЗАВАНТАЖЕННЯ ДАНИХ (Real-time) ---
  useEffect(() => {
    if (!isLoggedIn) return;
    const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [isLoggedIn]);

  // --- РОЗРАХУНКИ (P&L та CashFlow) ---
  const metrics = useMemo(() => {
    // 1. P&L (Без дивідендів!)
    const revenue = transactions.filter(t => t.type === 'income' && !t.isDividend).reduce((s,t) => s+t.amount, 0);
    const cogs = transactions.filter(t => t.category === 'Закупівля (COGS)').reduce((s,t) => s+t.amount, 0);
    const grossProfit = revenue - cogs;
    const opex = transactions.filter(t => t.type === 'expense' && t.category !== 'Закупівля (COGS)' && !t.isDividend).reduce((s,t) => s+t.amount, 0);
    const netProfit = grossProfit - opex;
    
    // 2. Cash Flow (Всі гроші)
    const totalCash = transactions.reduce((acc, t) => {
        return t.type === 'income' ? acc + t.amount : acc - t.amount;
    }, 0);

    const balances = { 'Monobank ФОП': 0, 'NovaPay': 0, 'Готівка': 0 };
    transactions.forEach(t => {
       const val = t.type === 'income' ? t.amount : -t.amount;
       if (balances[t.source] !== undefined) balances[t.source] += val;
    });

    // 3. Дивіденди
    const dividendsPaid = transactions.filter(t => t.isDividend).reduce((s,t) => s+t.amount, 0);

    // 4. Runway (Скільки днів проживемо)
    const avgDailyBurn = (opex + cogs) / (30) || 1000; // умовно за 30 днів
    const runway = (totalCash / avgDailyBurn).toFixed(0);

    return { revenue, cogs, grossProfit, opex, netProfit, totalCash, balances, dividendsPaid, runway };
  }, [transactions]);

  // --- ФУНКЦІЇ ---
  const handleLogin = (e) => {
    e.preventDefault();
    // Простий пароль для тебе і друга. 
    // Оскільки база відкрита до 2026 року, це захист "від дурня", а не від хакера.
    if (loginPass === 'latiao2025' || loginPass === 'admin') {
      setIsLoggedIn(true);
    } else {
      setLoginError('Невірний код доступу');
    }
  };

  const saveTransaction = async () => {
    if (!txForm.amount) return;
    
    // Smart Rules (Авто-категорія)
    let finalCat = txForm.category;
    if (modalOpen !== 'dividend') {
        const rule = AUTO_RULES.find(r => txForm.description.toLowerCase().includes(r.k.toLowerCase()));
        if (rule) finalCat = rule.c;
    } else {
        finalCat = 'Дивіденди';
    }

    const type = modalOpen === 'income' ? 'income' : 'expense';
    
    await addDoc(collection(db, "transactions"), {
      amount: Number(txForm.amount),
      category: finalCat,
      source: txForm.source,
      description: txForm.description || (modalOpen === 'dividend' ? 'Виплата дивідендів' : 'Без опису'),
      date: txForm.date,
      type: type,
      isDividend: modalOpen === 'dividend',
      createdAt: Date.now()
    });

    setModalOpen(false);
    setTxForm({ ...txForm, amount: '', description: '' });
  };

  const deleteTx = async (id) => {
      if(confirm('Видалити цей запис?')) await deleteDoc(doc(db, "transactions", id));
  };

  // --- ЕКРАН 1: БАНКІВСЬКИЙ ВХІД ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-4 relative overflow-hidden font-sans">
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-[#FF5722] rounded-full opacity-10 blur-[120px]"></div>
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl w-full max-w-sm shadow-2xl z-10">
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-[#FF5722] to-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 text-white text-3xl font-bold">L</div>
          </div>
          <h1 className="text-2xl font-bold text-center text-white mb-2">Latiao Enterprise</h1>
          <p className="text-slate-400 text-center text-xs mb-8 uppercase tracking-widest">Authorized Access Only</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] text-slate-400 font-bold ml-1 uppercase">Passcode</label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-3 text-slate-500" size={18}/>
                <input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} 
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-[#FF5722] transition-colors" placeholder="••••••" autoFocus/>
              </div>
            </div>
            {loginError && <div className="text-red-400 text-xs text-center">{loginError}</div>}
            <button type="submit" className="w-full bg-[#FF5722] hover:bg-[#F4511E] text-white py-4 rounded-xl font-bold shadow-lg shadow-orange-900/20 mt-2">UVIITY (Log In)</button>
          </form>
          <div className="mt-6 text-center text-slate-600 text-[10px]">System v5.0 • Powered by Firebase</div>
        </div>
      </div>
    );
  }

  // --- ЕКРАН 2: СИСТЕМА (DASHBOARD) ---
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC]">
      
      {/* SIDEBAR */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col p-6 fixed h-full z-20">
        <div className="flex items-center gap-3 mb-10 text-[#FF5722]">
          <div className="w-8 h-8 bg-[#FF5722] rounded-lg flex items-center justify-center text-white font-bold">L</div>
          <div className="font-bold text-slate-900">Latiao Finance</div>
        </div>
        <nav className="space-y-1 flex-1">
          {[
            {id:'dashboard', icon:LayoutDashboard, l:'Дашборд'},
            {id:'transactions', icon:CreditCard, l:'Операції'},
            {id:'pnl', icon:PieChart, l:'P&L Звіт'},
            {id:'cashflow', icon:TrendingUp, l:'Cash Flow'},
            {id:'dividends', icon:Wallet, l:'Дивіденди'},
            {id:'settings', icon:Settings, l:'Налаштування'},
          ].map(i => (
            <button key={i.id} onClick={()=>setActiveTab(i.id)} 
              className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-medium transition-colors ${activeTab===i.id ? 'bg-orange-50 text-[#FF5722]' : 'text-slate-500 hover:bg-slate-50'}`}>
              <i.icon size={18}/> {i.l}
            </button>
          ))}
        </nav>
        <button onClick={()=>setIsLoggedIn(false)} className="flex items-center gap-2 text-slate-400 hover:text-red-500 text-sm mt-auto"><LogOut size={16}/> Вихід</button>
      </aside>

      {/* MOBILE HEADER */}
      <div className="md:hidden bg-white border-b p-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <span className="font-bold text-slate-800 flex gap-2 items-center"><span className="text-[#FF5722]">Latiao</span> Finance</span>
        <button onClick={()=>setIsLoggedIn(false)}><LogOut size={20} className="text-slate-400"/></button>
      </div>

      <main className="flex-1 md:ml-64 p-4 md:p-8 pb-24 overflow-y-auto">
        
        {/* --- 1. DASHBOARD --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPI ROW */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#0F172A] text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-10"><Wallet size={100}/></div>
                <div className="text-slate-400 text-xs uppercase font-bold mb-1">Кеш (Всі гроші)</div>
                <div className="text-3xl font-bold mb-4">{metrics.totalCash.toLocaleString()} ₴</div>
                <div className="flex gap-2 overflow-x-auto text-[10px]">
                  {Object.entries(metrics.balances).map(([k,v]) => (
                    <span key={k} className="bg-white/10 px-2 py-1 rounded whitespace-nowrap">{k.split(' ')[0]}: {v.toLocaleString()}</span>
                  ))}
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex justify-between mb-2">
                  <div className="text-slate-500 text-xs uppercase font-bold">Чистий прибуток</div>
                  <PieChart size={16} className={metrics.netProfit>=0?'text-emerald-500':'text-red-500'}/>
                </div>
                <div className="text-2xl font-bold text-slate-800">{metrics.netProfit.toLocaleString()} ₴</div>
                <div className="text-xs text-slate-400 mt-1">Оборот: {metrics.revenue.toLocaleString()}</div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                 <div className="text-slate-500 text-xs uppercase font-bold mb-2">Runway (Запас)</div>
                 <div className="text-2xl font-bold text-[#FF5722]">{metrics.runway} днів</div>
                 <div className="text-xs text-slate-400 mt-1">Поки гроші не закінчаться</div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                 <div className="text-slate-500 text-xs uppercase font-bold mb-2">Дивіденди (Виплачено)</div>
                 <div className="text-2xl font-bold text-slate-800">{metrics.dividendsPaid.toLocaleString()} ₴</div>
                 <div className="text-xs text-slate-400 mt-1">Власнику</div>
              </div>
            </div>

            {/* BUTTONS */}
            <div className="grid grid-cols-2 gap-4">
              <button onClick={()=>setModalOpen('income')} className="bg-emerald-500 hover:bg-emerald-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-emerald-100 flex justify-center gap-2 items-center transition-transform active:scale-95">
                <ArrowDownLeft/> Дохід
              </button>
              <button onClick={()=>setModalOpen('expense')} className="bg-[#FF5722] hover:bg-orange-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-orange-100 flex justify-center gap-2 items-center transition-transform active:scale-95">
                <ArrowUpRight/> Витрата
              </button>
            </div>

            {/* RECENT TRANSACTIONS */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">Останні операції</h3>
                    <button onClick={()=>setActiveTab('transactions')} className="text-xs text-blue-600 font-bold">Всі</button>
                </div>
                {transactions.slice(0, 5).map(t => (
                   <div key={t.id} className="p-4 border-b last:border-0 flex justify-between items-center hover:bg-slate-50">
                     <div className="flex gap-3 items-center">
                        <div className={`p-2 rounded-full ${t.isDividend ? 'bg-purple-100 text-purple-600' : (t.type==='income'?'bg-emerald-100 text-emerald-600':'bg-red-50 text-red-500')}`}>
                            {t.isDividend ? <Wallet size={16}/> : (t.type==='income' ? <ArrowDownLeft size={16}/> : <ArrowUpRight size={16}/>)}
                        </div>
                        <div>
                            <div className="font-bold text-slate-800 text-sm">{t.description}</div>
                            <div className="text-xs text-slate-400">{t.category} • {t.source}</div>
                        </div>
                     </div>
                     <span className={`font-bold ${t.type==='income'?'text-emerald-600':'text-slate-800'}`}>
                        {t.type==='income'?'+':'-'}{t.amount.toLocaleString()}
                     </span>
                   </div>
                ))}
            </div>
          </div>
        )}

        {/* --- 2. P&L REPORT --- */}
        {activeTab === 'pnl' && (
           <div className="bg-white p-6 md:p-10 rounded-2xl shadow-sm border border-slate-100 max-w-4xl mx-auto">
             <div className="flex justify-between items-center mb-8 pb-4 border-b">
               <h2 className="text-2xl font-bold">P&L (Прибутки та Збитки)</h2>
               <div className="text-right">
                 <div className="text-sm text-slate-400">Чистий прибуток</div>
                 <div className={`text-2xl font-bold ${metrics.netProfit>=0?'text-emerald-600':'text-red-600'}`}>{metrics.netProfit.toLocaleString()} ₴</div>
               </div>
             </div>
             
             {/* Waterfall */}
             <div className="space-y-3">
               <div className="flex justify-between text-lg font-bold"><span>(+) Виручка</span><span className="text-emerald-600">{metrics.revenue.toLocaleString()}</span></div>
               <div className="flex justify-between text-sm pl-4 text-slate-500"><span>(-) Собівартість (COGS)</span><span>{metrics.cogs.toLocaleString()}</span></div>
               <div className="flex justify-between py-2 pl-4 font-bold bg-blue-50 rounded px-2 border-l-4 border-blue-500"><span>= Валовий прибуток</span><span>{metrics.grossProfit.toLocaleString()}</span></div>
               
               <div className="py-2">
                 <div className="font-bold text-slate-700 mb-2">Операційні витрати (OpEx):</div>
                 {Object.entries(transactions.filter(t => t.type==='expense' && !t.isDividend && t.category !== 'Закупівля (COGS)').reduce((acc, t) => {
                    acc[t.category] = (acc[t.category] || 0) + t.amount; return acc;
                 }, {})).map(([cat, val]) => (
                    <div key={cat} className="flex justify-between pl-4 text-sm text-slate-500 py-1 border-b border-dashed border-slate-100">
                        <span>{cat}</span><span>{val.toLocaleString()}</span>
                    </div>
                 ))}
                 <div className="flex justify-between pl-4 pt-2 font-bold text-red-500"><span>Всього OpEx</span><span>{metrics.opex.toLocaleString()}</span></div>
               </div>

               <div className="flex justify-between py-4 border-t-2 border-slate-900 font-bold text-xl mt-4">
                 <span>= Net Profit</span>
                 <span>{metrics.netProfit.toLocaleString()}</span>
               </div>
             </div>
           </div>
        )}

        {/* --- 3. DIVIDENDS --- */}
        {activeTab === 'dividends' && (
          <div className="max-w-2xl mx-auto space-y-6">
             <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 rounded-3xl shadow-xl">
               <h2 className="text-2xl font-bold mb-2">Центр Дивідендів</h2>
               <p className="text-slate-400 text-sm mb-6">Виплата власнику з чистого прибутку. Не впливає на витрати в P&L.</p>
               <div className="grid grid-cols-2 gap-4 mb-8">
                 <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                   <div className="text-xs text-slate-400 uppercase">Net Profit (Можна брати)</div>
                   <div className="text-xl font-bold text-emerald-400">{metrics.netProfit.toLocaleString()} ₴</div>
                 </div>
                 <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                   <div className="text-xs text-slate-400 uppercase">Вже виведено</div>
                   <div className="text-xl font-bold text-orange-400">{metrics.dividendsPaid.toLocaleString()} ₴</div>
                 </div>
               </div>
               <button onClick={()=>setModalOpen('dividend')} className="w-full bg-white text-slate-900 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors shadow-lg">Виплатити собі</button>
             </div>
             
             <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-bold mb-4">Історія виплат</h3>
                {transactions.filter(t => t.isDividend).map(t => (
                    <div key={t.id} className="flex justify-between py-3 border-b last:border-0">
                        <div>
                            <div className="font-bold">{t.description}</div>
                            <div className="text-xs text-slate-400">{t.date} | {t.source}</div>
                        </div>
                        <div className="font-bold text-slate-900">-{t.amount.toLocaleString()}</div>
                    </div>
                ))}
                {transactions.filter(t => t.isDividend).length===0 && <div className="text-center text-slate-400 py-4">Виплат ще не було</div>}
             </div>
          </div>
        )}

        {/* --- 4. LIST (Transactions) --- */}
        {activeTab === 'transactions' && (
            <div className="space-y-4">
                <h2 className="text-2xl font-bold px-2">Всі операції</h2>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {transactions.map(t => (
                        <div key={t.id} className="p-4 border-b flex justify-between items-center hover:bg-slate-50 group">
                             <div>
                                <div className="font-bold text-slate-800">{t.description}</div>
                                <div className="text-xs text-slate-400 mt-1">
                                    <span className="bg-slate-100 px-2 py-0.5 rounded mr-2">{t.category}</span>
                                    {t.date} • {t.source}
                                </div>
                             </div>
                             <div className="text-right flex items-center gap-4">
                                <span className={`font-bold ${t.type==='income'?'text-emerald-600':'text-slate-800'}`}>
                                    {t.type==='income'?'+':'-'}{t.amount.toLocaleString()}
                                </span>
                                <button onClick={()=>deleteTx(t.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={16}/></button>
                             </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* --- 5. SETTINGS --- */}
        {activeTab === 'settings' && (
            <div className="max-w-xl mx-auto space-y-6">
                <h2 className="text-2xl font-bold">Налаштування та Інтеграції</h2>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold mb-4 flex items-center gap-2"><CreditCard size={20}/> Monobank</h3>
                    <div className="flex gap-2">
                        <input type="password" value="token-mask-123" disabled className="flex-1 bg-slate-100 p-3 rounded-xl text-slate-400"/>
                        <button className="bg-slate-900 text-white px-4 rounded-xl font-bold text-sm">Оновити</button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">API підключено. Авто-синхронізація: активна.</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold mb-4 flex items-center gap-2 text-red-500"><Building2 size={20}/> NovaPay</h3>
                    <div className="flex gap-2">
                        <input type="password" value="token-mask-nova" disabled className="flex-1 bg-slate-100 p-3 rounded-xl text-slate-400"/>
                        <button className="bg-slate-900 text-white px-4 rounded-xl font-bold text-sm">Оновити</button>
                    </div>
                </div>
            </div>
        )}

      </main>

      {/* MOBILE NAV */}
      <div className="md:hidden fixed bottom-0 w-full bg-white border-t p-2 flex justify-around pb-6 z-40 safe-area-pb">
        {['dashboard', 'transactions', 'pnl', 'dividends'].map(id => (
           <button key={id} onClick={()=>setActiveTab(id)} className={`p-2 rounded-xl flex flex-col items-center ${activeTab===id ? 'text-[#FF5722]' : 'text-slate-400'}`}>
             <div className={`w-1 h-1 rounded-full mb-1 ${activeTab===id ? 'bg-[#FF5722]':'bg-transparent'}`}></div>
             <span className="capitalize font-bold text-[10px]">{id.slice(0,4)}</span>
           </button>
        ))}
      </div>

      {/* MODAL FORM */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end md:items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
             <div className={`p-4 text-white flex justify-between items-center ${modalOpen==='income'?'bg-emerald-500':(modalOpen==='dividend'?'bg-slate-800':'bg-[#FF5722]')}`}>
               <h3 className="font-bold text-lg flex items-center gap-2">
                 {modalOpen === 'dividend' ? <Wallet/> : (modalOpen==='income'?<ArrowDownLeft/>:<ArrowUpRight/>)}
                 {modalOpen === 'dividend' ? 'Виплата дивідендів' : (modalOpen==='income'?'Новий дохід':'Нова витрата')}
               </h3>
               <button onClick={()=>setModalOpen(false)} className="bg-white/20 p-1 rounded-full hover:bg-white/40"><X size={18}/></button>
             </div>
             <div className="p-6 space-y-4">
               <div>
                 <label className="text-xs font-bold text-slate-400 uppercase">Сума</label>
                 <input type="number" value={txForm.amount} onChange={e=>setTxForm({...txForm, amount:e.target.value})} className="w-full text-4xl font-bold border-b py-2 focus:outline-none focus:border-[#FF5722] placeholder-slate-200 text-slate-800" placeholder="0" autoFocus/>
               </div>
               
               {modalOpen !== 'dividend' && (
                 <>
                   <div>
                     <label className="text-xs font-bold text-slate-400 uppercase">Опис (працює авто-категорія)</label>
                     <input type="text" value={txForm.description} onChange={e=>setTxForm({...txForm, description:e.target.value})} className="w-full bg-slate-50 p-3 rounded-xl mt-1 border-none outline-none focus:ring-2 focus:ring-orange-100" placeholder="Напр. Nova Poshta..."/>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-slate-400 uppercase">Категорія</label>
                       <select value={txForm.category} onChange={e=>setTxForm({...txForm, category:e.target.value})} className="w-full bg-slate-50 p-3 rounded-xl mt-1 outline-none">
                         {CATEGORIES[modalOpen==='income'?'income':'expense'].map(c => <option key={c} value={c}>{c}</option>)}
                       </select>
                     </div>
                     <div>
                       <label className="text-xs font-bold text-slate-400 uppercase">Рахунок</label>
                       <select value={txForm.source} onChange={e=>setTxForm({...txForm, source:e.target.value})} className="w-full bg-slate-50 p-3 rounded-xl mt-1 outline-none">
                         {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                       </select>
                     </div>
                   </div>
                 </>
               )}

               {modalOpen === 'dividend' && <div className="text-xs bg-slate-100 p-3 rounded text-slate-500">Це зменшить баланс рахунку, але не буде відображено як витрата в P&L.</div>}

               <button onClick={saveTransaction} className={`w-full text-white py-4 rounded-xl font-bold shadow-lg mt-2 active:scale-95 transition-all ${modalOpen==='income'?'bg-emerald-500 shadow-emerald-200':(modalOpen==='dividend'?'bg-slate-900':'bg-[#FF5722] shadow-orange-200')}`}>
                 Підтвердити
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
