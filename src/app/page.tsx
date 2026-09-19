import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientDashboard from '@/app/(client)/dashboard/page'

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Si el usuario es admin, redirigir al panel de atención de Zahir
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') {
    redirect('/panel')
  }

  // Si es cliente, la raíz (/) renderiza directamente el Dashboard de cliente
  return <ClientDashboard />
}
