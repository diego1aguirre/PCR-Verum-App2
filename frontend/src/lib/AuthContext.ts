import { createContext, useContext } from 'react'
import type { User } from '@supabase/supabase-js'

export const AuthContext = createContext<User | null>(null)
export function useAuth() { return useContext(AuthContext) }
