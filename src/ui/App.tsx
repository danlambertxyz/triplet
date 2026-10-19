import { ExportScreen } from './ExportScreen';
import { MainScreen } from './MainScreen';
import { SetupScreen } from './SetupScreen';
import { useApp } from './store';

export function App() {
  const settings = useApp((s) => s.settings);
  const screen = useApp((s) => s.screen);
  if (!settings) return <SetupScreen />;
  return screen === 'export' ? <ExportScreen settings={settings} /> : <MainScreen settings={settings} />;
}
