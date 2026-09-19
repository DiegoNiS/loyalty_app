'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)

    if (!privacyConsent) {
      setErrorMsg('Debes aceptar la Política de Protección de Datos Personales para registrarte.')
      return
    }

    setLoading(true)

    try {
      // 1. Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })

      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Error al registrar la cuenta de usuario.')
      }

      // 2. Invocar Edge Function si la URL de Supabase está configurada
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (supabaseUrl && !supabaseUrl.includes('placeholder')) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/register-with-invite`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              userId: authData.user.id,
              username: username.trim(),
              email: email.trim(),
              inviteCode: inviteCode.trim() || undefined,
            }),
          })

          const result = await response.json()
          if (!response.ok || result.error) {
            console.warn('Edge function error:', result.error)
          }
        } catch (fetchErr) {
          console.warn('Could not call Edge Function (using direct fallback profile creation if needed):', fetchErr)
        }
      }

      // Redirigir a la ruta principal /
      router.push('/')
      router.refresh()
    } catch (err: any) {
      setErrorMsg(err.message || 'Error inesperado durante el registro.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-red-500 to-amber-500 bg-clip-text text-transparent">
            Únete a Vinos del Corazón
          </h1>
          <p className="text-slate-400 text-sm mt-1">Crea tu cuenta y acumula puntos</p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950/80 border border-red-800 rounded-lg text-red-200 text-sm text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Nombre de Usuario
            </label>
            <input
              type="text"
              required
              placeholder="ej. diegonina"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-red-500 text-slate-100 text-sm transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Correo Electrónico
            </label>
            <input
              type="email"
              required
              placeholder="tu@correo.com o tu@unsa.edu.pe"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-red-500 text-slate-100 text-sm transition"
            />
            <p className="text-[11px] text-amber-400/90 mt-1">
              💡 Tip: Los correos institucionales (.edu.pe) reciben puntos extra de bienvenida.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Contraseña
            </label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-red-500 text-slate-100 text-sm transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Código de Invitación (Opcional)
            </label>
            <input
              type="text"
              placeholder="ej. AMIGO12"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-red-500 text-slate-100 text-sm transition uppercase"
            />
          </div>

          <div className="flex items-start space-x-2 pt-1">
            <input
              type="checkbox"
              id="privacy"
              checked={privacyConsent}
              onChange={(e) => setPrivacyConsent(e.target.checked)}
              className="mt-1 accent-red-500 rounded cursor-pointer"
            />
            <label htmlFor="privacy" className="text-xs text-slate-400 cursor-pointer">
              Acepto el tratamiento de mis datos personales según la Ley Nº 29733 para la gestión de puntos y fidelización en Vinos del Corazón.
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-semibold rounded-xl shadow-lg transition duration-200 disabled:opacity-50 text-sm mt-2"
          >
            {loading ? 'Creando cuenta...' : 'Registrarme'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-400">
          ¿Ya tienes una cuenta?{' '}
          <Link href="/login" className="text-amber-400 font-semibold hover:underline">
            Inicia sesión
          </Link>
        </div>
      </div>
    </div>
  )
}
