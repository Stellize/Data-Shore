import { createContext, useContext } from 'react';

export const ConsoleContext = createContext({
  onExpired: () => {},
  demoMode: false,
  hubName: 'Data Shore',
});

export function useConsole() {
  return useContext(ConsoleContext);
}
