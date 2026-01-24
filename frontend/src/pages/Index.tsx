import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';

const Index = () => {
  const navigate = useNavigate();
  const { state, isValidating } = useApp();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Wait for token validation to complete before redirecting
    if (isValidating) return;
    
    // Preserve call parameter for redirect
    const callNumber = searchParams.get('call');
    const callParam = callNumber ? `?call=${encodeURIComponent(callNumber)}` : '';
    
    // Redirect based on auth state
    if (state.user && state.token) {
      navigate(`/dashboard${callParam}`);
    } else {
      navigate(`/login${callParam}`);
    }
  }, [state.user, state.token, navigate, isValidating, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold text-gradient">Fyntra</h1>
        <p className="text-xl text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
};

export default Index;
