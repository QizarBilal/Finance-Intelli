import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { hasToken } from '../lib/api-client';

export function useAuth() {
  const tokenExists = hasToken();

  const { data: profile, isLoading, isError } = useGetMe({
    query: {
      enabled: tokenExists,
      queryKey: getGetMeQueryKey(),
      retry: 0,
    }
  });

  const isAuthenticated = !!profile && tokenExists && !isError;

  return {
    isAuthenticated,
    isSetup: true,   // multi-user — signup always available
    isLoading: tokenExists ? isLoading : false,
    profile,
  };
}
