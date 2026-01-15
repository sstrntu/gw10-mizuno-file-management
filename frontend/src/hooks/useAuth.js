import { useState, useEffect } from 'react';
import { supabase, signInWithGoogle, signOut } from '../config/supabase';

export function useAuth() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState(null);

    useEffect(() => {
        // Check initial session
        supabase.auth.getSession().then(({ data: { session }, error }) => {
            if (error) {
                console.error('Session error:', error);
            } else {
                setSession(session);
                setUser(session?.user ?? null);
            }
            setLoading(false);
        });

        // Subscribe to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);

            // Clean up the URL hash if we have a session and the hash contains access_token
            if (session && window.location.hash && window.location.hash.includes('access_token')) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        });

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    return {
        user,
        session,
        loading,
        signInWithGoogle,
        signOut
    };
}
