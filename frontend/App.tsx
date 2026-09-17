import { StatusBar } from 'expo-status-bar';

import RootNavigator from './src/navigation/RootNavigator';

/**
 * App entry point. Renders the full navigation architecture (App → RootNavigator
 * → NavigationContainer → role-based navigator → placeholder screen) so this
 * shell proves the whole structure actually wires together, not just that a
 * single static screen renders. With no session yet, this currently launches
 * straight into AuthNavigator's Login placeholder — see src/navigation/RootNavigator.tsx.
 */
export default function App() {
  return (
    <>
      <RootNavigator />
      <StatusBar style="auto" />
    </>
  );
}
