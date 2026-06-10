import { PosAppProvider } from "./app/PosAppProvider";
import { PosRouter } from "./app/PosRouter";

function App() {
  return (
    <PosAppProvider>
      <PosRouter />
    </PosAppProvider>
  );
}

export default App;
