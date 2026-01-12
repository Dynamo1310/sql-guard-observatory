import { useState, useEffect, useRef } from 'react';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Sun, Moon, Upload, Trash2, LogOut, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/services/api';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import logoSupervielleBlanco from '/LogoSupervielleBlancoLetras.svg';
import logoSupervielleNegro from '/LogoSupervielleNegroLetras.svg';
import logoSupervielleAnimado from '/LogoSupervielleAnimado.svg';

export function TopBar() {
  const { state } = useSidebar();
  const { user, logout } = useAuth();
  const isCollapsed = state === 'collapsed';

  // Estados para el menú de usuario
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [animationTimestamp, setAnimationTimestamp] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Función para reiniciar la animación (cambia el query param para forzar recarga)
  const restartAnimation = () => {
    setAnimationTimestamp(Date.now());
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    window.dispatchEvent(new CustomEvent('themeChange', { detail: { theme: newTheme } }));
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const handleLogout = async () => {
    logout();
    await new Promise(r => setTimeout(r, 500));
    window.location.replace('/login');
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Formato no válido. Use JPG, PNG, GIF o WebP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5MB.');
      return;
    }

    try {
      setUploadingPhoto(true);
      await authApi.uploadProfilePhoto(file);
      toast.success('Foto de perfil actualizada');
      window.location.reload();
    } catch {
      toast.error('Error al subir la foto');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async () => {
    try {
      setDeletingPhoto(true);
      await authApi.deleteProfilePhoto();
      toast.success('Foto de perfil eliminada');
      window.location.reload();
    } catch {
      toast.error('Error al eliminar la foto');
    } finally {
      setDeletingPhoto(false);
    }
  };

  return (
    <header className="h-16 min-h-16 border-b border-border/40 bg-background/70 backdrop-blur-xl flex items-center px-4 gap-4 sticky top-0 z-40 shadow-sm">
      {!isCollapsed && <SidebarTrigger />}

      {/* Logo Supervielle Animado */}
      <div 
        className="flex items-center cursor-pointer -ml-4 group"
        onMouseEnter={restartAnimation}
      >
        <img 
          src={`${logoSupervielleAnimado}?t=${animationTimestamp}`}
          alt="Supervielle" 
          className={`h-10 w-auto transition-all duration-300 group-hover:scale-105 ${theme === 'dark' ? 'invert' : ''}`}
        />
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {/* Botón de tema claro/oscuro */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9 rounded-lg transition-all duration-300 hover:scale-105 hover:bg-accent/80"
        >
          {theme === 'light' ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          <span className="sr-only">Cambiar tema</span>
        </Button>

        {/* Input oculto para subir foto */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Menú de usuario */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-lg p-1.5 pr-3 text-sm transition-all duration-300 hover:bg-accent/60 hover:shadow-sm"
            >
              <UserAvatar
                photoUrl={user?.profilePhotoUrl}
                displayName={user?.displayName}
                domainUser={user?.domainUser}
                size="sm"
              />
              <div className="flex-1 text-left min-w-0 hidden sm:block">
                <p className="text-sm font-medium truncate">{user?.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.domainUser}</p>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground hidden sm:block transition-transform duration-300 group-hover:rotate-180" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            side="bottom" 
            align="end"
            className="w-56 bg-background/95 backdrop-blur-xl border-border/50 shadow-lg"
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.domainUser}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            <DropdownMenuGroup>
              {/* Subir foto */}
              <DropdownMenuItem 
                onClick={handleUploadClick}
                disabled={uploadingPhoto}
                className="cursor-pointer"
              >
                <Upload className={`mr-2 h-4 w-4 ${uploadingPhoto ? 'animate-pulse' : ''}`} />
                {uploadingPhoto ? 'Subiendo...' : 'Subir Foto de Perfil'}
              </DropdownMenuItem>
              
              {/* Eliminar foto */}
              {user?.hasProfilePhoto && (
                <DropdownMenuItem 
                  onClick={handleDeletePhoto}
                  disabled={deletingPhoto}
                  className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 className={`mr-2 h-4 w-4 ${deletingPhoto ? 'animate-pulse' : ''}`} />
                  {deletingPhoto ? 'Eliminando...' : 'Eliminar Foto'}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            
            <DropdownMenuSeparator />
            
            {/* Cerrar sesión */}
            <DropdownMenuItem 
              onClick={handleLogout}
              className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
