type Props = {
  pin: string;
  setPin: (v: string) => void;
  deviceId: string;
  setDeviceId: (v: string) => void;
  authError: string;
  onLogin: () => void;
};

export function LoginPage({ pin, setPin, deviceId, setDeviceId, authError, onLogin }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#1C1408' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-semibold" style={{ color: '#2A1E0C' }}>Bake & Grill POS</h1>
        <p className="mt-1" style={{ color: '#8B7355' }}>PIN login for staff</p>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium" style={{ color: '#2A1E0C' }}>Device ID</label>
          <input
            className="w-full rounded-lg px-3 py-2"
            style={{ border: '1px solid #EDE4D4' }}
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          />
          <label className="block text-sm font-medium" style={{ color: '#2A1E0C' }}>PIN</label>
          <input
            type="password"
            className="w-full rounded-lg px-3 py-2"
            style={{ border: '1px solid #EDE4D4' }}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onLogin()}
          />
          <button
            className="w-full rounded-lg text-white py-2 font-semibold transition"
            style={{ background: '#D4813A' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#B86820'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#D4813A'; }}
            onClick={onLogin}
          >
            Login
          </button>
          {authError && <p className="text-sm text-rose-600">{authError}</p>}
        </div>
        <div className="mt-4 text-center">
          <a href="/" className="text-sm" style={{ color: '#8B7355', textDecoration: 'none' }}>
            ← Main Website
          </a>
        </div>
        {import.meta.env.DEV && (
          <p className="text-xs mt-4" style={{ color: '#8B7355' }}>
            Dev PINs: Owner(1111), Admin(2222), Manager(3333), Cashier(4444)<br />
            Device ID: Use "POS-001" or any identifier
          </p>
        )}
      </div>
    </div>
  );
}
