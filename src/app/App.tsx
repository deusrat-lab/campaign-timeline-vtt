import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { ToastProvider } from '../components/ui';
import { ExpenseSheet } from '../components/ExpenseSheet';
import { useCurrentMonthId, useEnsureSeeded, useSettings } from '../hooks/useDb';
import { setLocale, uk } from '../i18n';
import { HomePage } from '../pages/Home';
import { OperationsPage } from '../pages/Operations';
import { BudgetPage } from '../pages/Budget';
import { ReportsPage } from '../pages/Reports';
import { SettingsPage } from '../pages/Settings';
import { MonthWizard } from '../features/months/MonthWizard';
import { CloseMonthPage } from '../features/months/CloseMonth';
import { CategoriesPage } from '../features/categories/CategoriesPage';
import { PwaBanners } from '../pwa/PwaBanners';
import { requestPersistentStorage } from '../pwa/usePwa';

export default function App() {
  const ready = useEnsureSeeded();
  const settings = useSettings();
  const monthId = useCurrentMonthId(settings);
  const [expenseOpen, setExpenseOpen] = useState(false);

  useEffect(() => {
    setLocale(settings?.locale ?? 'uk');
    const theme = settings?.theme ?? 'system';
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [settings?.locale, settings?.theme]);

  useEffect(() => {
    // Просимо постійне сховище, щоб браузер не витер фінансові дані.
    requestPersistentStorage();
  }, []);

  if (!ready) {
    return (
      <div className="empty" style={{ marginTop: 80 }}>
        <div className="emoji">💰</div>
        <p>Завантаження…</p>
      </div>
    );
  }

  return (
    <ToastProvider>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage monthId={monthId} onAddExpense={() => setExpenseOpen(true)} />} />
          <Route path="/operations" element={<OperationsPage monthId={monthId} />} />
          <Route path="/budget" element={<BudgetPage monthId={monthId} />} />
          <Route path="/reports" element={<ReportsPage activeMonthId={monthId} />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/categories" element={<CategoriesPage activeMonthId={monthId} />} />
          <Route path="/new-month" element={<MonthWizard />} />
          <Route path="/close/:monthId" element={<CloseMonthPage />} />
        </Routes>
      </main>

      <ExpenseSheet monthId={monthId} open={expenseOpen} onClose={() => setExpenseOpen(false)} />

      <PwaBanners />
      <BottomNav onAddExpense={() => setExpenseOpen(true)} disableExpense={!monthId} />
    </ToastProvider>
  );
}

function BottomNav({ onAddExpense, disableExpense }: { onAddExpense: () => void; disableExpense: boolean }) {
  const navigate = useNavigate();
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="nav-icon" aria-hidden>🏠</span>
        {uk.nav.home}
      </NavLink>
      <NavLink to="/operations" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="nav-icon" aria-hidden>📋</span>
        {uk.nav.operations}
      </NavLink>
      <button
        className="fab"
        aria-label={uk.nav.expense}
        onClick={() => (disableExpense ? navigate('/new-month') : onAddExpense())}
      >
        ＋
      </button>
      <NavLink to="/budget" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="nav-icon" aria-hidden>📊</span>
        {uk.nav.budget}
      </NavLink>
      <NavLink to="/reports" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="nav-icon" aria-hidden>📈</span>
        {uk.nav.reports}
      </NavLink>
    </nav>
  );
}
