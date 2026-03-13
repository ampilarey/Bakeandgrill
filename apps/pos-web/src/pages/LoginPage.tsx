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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Bake & Grill POS</h1>
        <p className="text-slate-500 mt-1">PIN login for staff</p>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Device ID</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          />
          <label className="block text-sm font-medium text-slate-700">PIN</label>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onLogin()}
          />
          <button
            className="w-full rounded-lg bg-orange-600 text-white py-2 font-semibold hover:bg-orange-700 transition"
            onClick={onLogin}
          >
            Login
          </button>
          {authError && <p className="text-sm text-rose-600">{authError}</p>}
        </div>
        {import.meta.env.DEV && (
          <p className="text-xs text-slate-400 mt-6">
            Dev PINs: Owner(1111), Admin(2222), Manager(3333), Cashier(4444)<br />
            Device ID: Use "POS-001" or any identifier
          </p>
        )}
      </div>
    </div>
  );
}
