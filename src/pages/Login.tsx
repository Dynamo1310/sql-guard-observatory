import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authApi } from '@/services/api';
import windowsIconBlack from '/WindowsIconBlack.svg';
import windowsIconWhite from '/WindowsIconWhite.svg';
import logoSupervielleBlanco from '/LogoSupervielleBlancoLetras.svg';
import logoSupervielleNegro from '/LogoSupervielleNegroLetras.svg';
// Logos SQLNova
import sqlNovaBlackLogo from '/SQLNovaBlackLogo.svg';
import sqlNovaWhiteLogo from '/SQLNovaWhiteLogo.svg';
import { Loader2, Sun, Moon, Database, Sparkles, Server, HardDrive, Zap, Shield } from 'lucide-react';

// Helper para obtener el saludo según la hora y día
function getGreeting(): string {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Domingo, 5 = Viernes
  const dayOfMonth = now.getDate();
  const month = now.getMonth(); // 0 = Enero

  // Mensajes especiales
  // Navidad
  if (month === 11 && dayOfMonth === 25) return '🎄 ¡Feliz Navidad!';
  // Nochebuena
  if (month === 11 && dayOfMonth === 24) return '🎄 ¡Feliz Nochebuena!';
  // Año nuevo
  if (month === 0 && dayOfMonth === 1) return '🎆 ¡Feliz Año Nuevo!';

  if (month === 0 && dayOfMonth === 2) return '🎆 ¡Feliz Año Nuevo!';
  // Nochevieja
  if (month === 11 && dayOfMonth === 31) return '🎆 ¡Feliz Año Nuevo!';
  // Día del trabajador
  if (month === 4 && dayOfMonth === 1) return '💪 ¡Feliz Día del Trabajador!';
  // Halloween
  if (month === 9 && dayOfMonth === 31) return '🎃 ¡Feliz Halloween!';

  // Mensajes por día de la semana
  if (dayOfWeek === 5) return 'NO A LA REFORMA LABORAL‼️';
  if (dayOfWeek === 1) return '💪 ¡Arrancamos la semana!';
  if (dayOfWeek === 0) return '😴 ¿Trabajando un domingo?';
  if (dayOfWeek === 6) return '🤔 ¿Trabajando un sábado?';

  // Saludo según la hora
  if (hour >= 6 && hour < 12) return '¡Buenos días!';
  if (hour >= 12 && hour < 19) return '¡Buenas tardes!';
  return '¡Buenas noches!';
}

// Novedades / Changelog
const whatsNew = [
  { text: "Nuevo sistema de inventario de servidores y BBDD", isNew: true },
  //{ text: "Vault DBA para gestión segura de credenciales", isNew: true },
  //{ text: "Nuevo sistema de guardias DBA con intercambios", isNew: true },
  { text: "Dashboard de parcheos y compliance", isNew: true },
];

// Componente de partículas flotantes - MÁS Y MÁS VISIBLES
function FloatingParticles() {
  const particles = [
    // Esquina superior izquierda
    { top: '5%', left: '3%', delay: '0s', size: 'h-10 w-10', opacity: 'opacity-50' },
    { top: '12%', left: '8%', delay: '1.5s', size: 'h-7 w-7', opacity: 'opacity-45' },
    { top: '18%', left: '2%', delay: '3s', size: 'h-6 w-6', opacity: 'opacity-40' },
    // Esquina superior derecha
    { top: '8%', right: '5%', delay: '0.5s', size: 'h-9 w-9', opacity: 'opacity-50' },
    { top: '15%', right: '12%', delay: '2s', size: 'h-6 w-6', opacity: 'opacity-45' },
    { top: '22%', right: '3%', delay: '4s', size: 'h-8 w-8', opacity: 'opacity-40' },
    // Centro izquierda
    { top: '35%', left: '2%', delay: '1s', size: 'h-8 w-8', opacity: 'opacity-50' },
    { top: '45%', left: '6%', delay: '2.5s', size: 'h-6 w-6', opacity: 'opacity-45' },
    { top: '55%', left: '3%', delay: '4.5s', size: 'h-7 w-7', opacity: 'opacity-40' },
    // Centro derecha
    { top: '38%', right: '4%', delay: '0.8s', size: 'h-7 w-7', opacity: 'opacity-50' },
    { top: '48%', right: '8%', delay: '3s', size: 'h-9 w-9', opacity: 'opacity-45' },
    { top: '58%', right: '2%', delay: '5s', size: 'h-6 w-6', opacity: 'opacity-40' },
    // Esquina inferior izquierda
    { top: '70%', left: '4%', delay: '1.2s', size: 'h-8 w-8', opacity: 'opacity-50' },
    { top: '78%', left: '10%', delay: '2.8s', size: 'h-6 w-6', opacity: 'opacity-45' },
    { top: '88%', left: '2%', delay: '4.2s', size: 'h-9 w-9', opacity: 'opacity-40' },
    // Esquina inferior derecha
    { top: '72%', right: '6%', delay: '0.3s', size: 'h-7 w-7', opacity: 'opacity-50' },
    { top: '82%', right: '3%', delay: '2.2s', size: 'h-8 w-8', opacity: 'opacity-45' },
    { top: '90%', right: '10%', delay: '3.8s', size: 'h-6 w-6', opacity: 'opacity-40' },
    // Adicionales distribuidos
    { top: '25%', left: '15%', delay: '5.5s', size: 'h-5 w-5', opacity: 'opacity-35' },
    { top: '65%', right: '15%', delay: '6s', size: 'h-5 w-5', opacity: 'opacity-35' },
  ];

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((p, i) => (
        <div
          key={i}
          className={`particle ${i % 2 === 0 ? '' : 'particle-slow'} ${p.size} text-muted-foreground ${p.opacity}`}
          style={{
            top: p.top,
            left: p.left,
            right: p.right,
            animationDelay: p.delay,
          }}
        >
          <Database className="w-full h-full" />
        </div>
      ))}
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Autenticando con Windows...');

  // Inicializar tema desde localStorage o preferencia del sistema
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');

    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const handleWindowsLogin = async () => {
    setLoading(true);
    setError('');

    try {
      setStatus('Verificando credenciales de Windows...');
      await authApi.windowsLogin();

      setStatus('Autenticación exitosa. Redirigiendo...');
      // Redirigir inmediatamente - windowsLogin ya esperó la pre-carga completa
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión con Windows. Asegúrate de estar en el dominio gscorp.ad y estar en la lista blanca de usuarios.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      {/* Partículas flotantes de fondo */}
      <FloatingParticles />

      {/* Theme Toggle - Esquina superior derecha */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2.5 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-white/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 z-10 backdrop-blur-sm shadow-sm"
        title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      >
        {theme === 'dark' ? (
          <Sun className="h-5 w-5 text-white" />
        ) : (
          <Moon className="h-5 w-5 text-slate-700" />
        )}
      </button>

      {/* Contenedor central con saludo y card */}
      <div className="flex flex-col items-center z-10 animate-fade-in-up">
        {/* Saludo dinámico - fuera de la caja */}
        <p className="text-2xl font-medium text-foreground mb-6 animate-fade-in">
          {getGreeting()}
        </p>

        <Card className="w-full max-w-md relative bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/50 dark:border-slate-700/50 shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50">
          <CardHeader className="space-y-1 pb-2">
            {/* Logo Supervielle */}
            <div className="flex items-center justify-center mb-2">
              <img
                src={logoSupervielleNegro}
                alt="Supervielle"
                className="logo-light h-9 w-auto"
              />
              <img
                src={logoSupervielleBlanco}
                alt="Supervielle"
                className="logo-dark h-9 w-auto"
              />
            </div>

            {/* Logo SQLNova con animación hover */}
            <div className="flex items-center justify-center py-6 group cursor-default">
              <img
                src={sqlNovaBlackLogo}
                alt="SQL Nova"
                className="logo-light h-16 w-auto transition-all duration-300 group-hover:scale-105 group-hover:drop-shadow-lg"
              />
              <img
                src={sqlNovaWhiteLogo}
                alt="SQL Nova"
                className="logo-dark h-16 w-auto transition-all duration-300 group-hover:scale-105 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
              />
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center space-y-4 py-6">
                <div className="relative">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
                <p className="text-sm text-muted-foreground text-center">{status}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4 py-2">
                <Button
                  onClick={handleWindowsLogin}
                  className="w-full"
                  disabled={loading}
                  size="lg"
                >
                  <img
                    src={windowsIconWhite}
                    alt="Windows"
                    className="logo-light h-5 w-5 mr-2"
                  />
                  <img
                    src={windowsIconBlack}
                    alt="Windows"
                    className="logo-dark h-5 w-5 mr-2"
                  />
                  Iniciar Sesión con Windows
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Usa tu cuenta del dominio gscorp.ad
                </p>

                {error && (
                  <div className="text-xs text-muted-foreground text-center space-y-2">
                    <p className="font-medium">Verifica que:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-left">
                      <li>Estés conectado al dominio gscorp.ad</li>
                      <li>Tu usuario esté en la lista blanca</li>
                      <li>Windows Authentication esté habilitado</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Qué hay de nuevo */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Qué hay de nuevo</span>
              </div>
              <ul className="space-y-2">
                {whatsNew.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-primary mt-0.5">•</span>
                    <span className="flex-1">{item.text}</span>
                    {item.isNew && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground rounded">
                        NUEVO
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
