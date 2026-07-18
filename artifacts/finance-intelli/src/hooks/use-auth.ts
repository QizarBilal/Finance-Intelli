import { useGetMe, getGetMeQueryKey, useCheckProfileExists, getCheckProfileExistsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { hasToken } from '../lib/api-client';

export function useAuth() {
  const queryClient = useQueryClient();
  const tokenExists = hasToken();
  
  const { data: profile, isLoading: isProfileLoading, isError: isProfileError, error: profileError } = useGetMe({
    query: {
      enabled: tokenExists,
      queryKey: getGetMeQueryKey(),
      retry: 0
    }
  });

  const { data: setupStatus, isLoading: isSetupLoading } = useCheckProfileExists({
    query: {
      queryKey: getCheckProfileExistsQueryKey(),
      retry: 0
    }
  });

  const isLoading = isProfileLoading || isSetupLoading;
  const isAuthenticated = !!profile && tokenExists;
  const isSetup = setupStatus?.exists === true;

  return {
    isAuthenticated,
    isSetup,
    isLoading,
    profile,
    profileError
  };
}
