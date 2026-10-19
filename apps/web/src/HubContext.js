import { createContext, useContext } from 'react';

export const HubContext = createContext({
  data: null,
  error: null,
  loading: true,
  reload: () => {},
});

export function useHub() {
  return useContext(HubContext);
}
