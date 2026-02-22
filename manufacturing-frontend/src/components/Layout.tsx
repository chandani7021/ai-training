import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <header className="bg-blue-700 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold tracking-tight">
            SOP Training
          </Link>
          <div className="flex items-center gap-4">
            {user && (
              <>
                <span className="text-sm opacity-80 hidden sm:inline">
                  {user.email} &middot; <span className="capitalize">{user.role}</span>
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
