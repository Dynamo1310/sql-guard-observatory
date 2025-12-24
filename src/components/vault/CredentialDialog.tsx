/**
 * Dialog para crear/editar credenciales
 */
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Plus, X, Server, Lock, CalendarIcon, FolderLock, Check, UserPlus, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  CredentialDto,
  CreateCredentialRequest,
  UpdateCredentialRequest,
  CredentialType,
  vaultApi,
  AvailableServerDto,
  CredentialGroupDto
} from '@/services/vaultApi';
import { toast } from 'sonner';
import { ServerSelector } from './ServerSelector';
import { PasswordInput } from '@/components/ui/password-input';

const formSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(256),
  credentialType: z.enum(['SqlAuth', 'WindowsAD', 'Other']),
  username: z.string().min(1, 'El usuario es requerido').max(256),
  password: z.string().optional(),
  domain: z.string().max(256).optional(),
  description: z.string().max(1000).optional(),
  notes: z.string().optional(),
  expiresAt: z.date().optional(),
  isPrivate: z.boolean()
});

type FormData = z.infer<typeof formSchema>;

interface CredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential?: CredentialDto;
  onSuccess?: () => void;
  defaultGroupId?: number;
  /** Si es true, la credencial será siempre privada y no se mostrará el switch */
  forcePrivate?: boolean;
}

export function CredentialDialog({
  open,
  onOpenChange,
  credential,
  onSuccess,
  defaultGroupId,
  forcePrivate = false
}: CredentialDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [availableServers, setAvailableServers] = useState<AvailableServerDto[]>([]);
  const [selectedServers, setSelectedServers] = useState<{serverName: string; instanceName?: string; connectionPurpose?: string}[]>([]);
  const [availableGroups, setAvailableGroups] = useState<CredentialGroupDto[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [availableUsers, setAvailableUsers] = useState<{id: string; userName: string; displayName?: string; email?: string}[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const isEditing = !!credential;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      credentialType: 'SqlAuth',
      username: '',
      password: '',
      domain: '',
      description: '',
      notes: '',
      isPrivate: false
    }
  });

  // Cargar servidores, grupos y usuarios disponibles
  useEffect(() => {
    if (open) {
      vaultApi.getAvailableServers()
        .then(setAvailableServers)
        .catch(console.error);
      
      vaultApi.getGroups()
        .then(setAvailableGroups)
        .catch(console.error);

      // Cargar usuarios disponibles para compartir
      vaultApi.getAvailableUsers()
        .then(setAvailableUsers)
        .catch(console.error);
    }
  }, [open]);

  // Resetear form cuando se abre el dialog
  useEffect(() => {
    if (open) {
      if (credential) {
        form.reset({
          name: credential.name,
          credentialType: credential.credentialType,
          username: credential.username,
          password: '',
          domain: credential.domain || '',
          description: credential.description || '',
          notes: credential.notes || '',
          expiresAt: credential.expiresAt ? new Date(credential.expiresAt) : undefined,
          isPrivate: credential.isPrivate
        });
        setSelectedServers(credential.servers.map(s => ({
          serverName: s.serverName,
          instanceName: s.instanceName,
          connectionPurpose: s.connectionPurpose
        })));
        // Cargar grupos actuales de la credencial
        setSelectedGroupIds(credential.groupShares?.map(gs => gs.groupId) || []);
        // Cargar usuarios actuales
        setSelectedUserIds(credential.userShares?.map(us => us.userId) || []);
      } else {
        form.reset({
          name: '',
          credentialType: 'SqlAuth',
          username: '',
          password: '',
          domain: '',
          description: '',
          notes: '',
          // Si forcePrivate, siempre privada; sino, por defecto true (las credenciales siempre son privadas)
          isPrivate: true
        });
        setSelectedServers([]);
        // Si hay un grupo por defecto (al crear desde grupo), seleccionarlo
        setSelectedGroupIds(defaultGroupId ? [defaultGroupId] : []);
        setSelectedUserIds([]);
      }
    }
  }, [open, credential, form, defaultGroupId, forcePrivate]);

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      // Las credenciales siempre son privadas (isPrivate = true)
      const finalIsPrivate = true;
      
      if (isEditing) {
        const updateRequest: UpdateCredentialRequest = {
          name: data.name,
          credentialType: data.credentialType as CredentialType,
          username: data.username,
          newPassword: data.password || undefined,
          domain: data.domain || undefined,
          description: data.description || undefined,
          notes: data.notes || undefined,
          expiresAt: data.expiresAt?.toISOString(),
          isPrivate: finalIsPrivate
        };
        await vaultApi.updateCredential(credential!.id, updateRequest);
        toast.success('Credencial actualizada', {
          description: 'Los cambios se guardaron correctamente.'
        });
      } else {
        if (!data.password) {
          form.setError('password', { message: 'La contraseña es requerida' });
          setIsLoading(false);
          return;
        }
        const createRequest: CreateCredentialRequest = {
          name: data.name,
          credentialType: data.credentialType as CredentialType,
          username: data.username,
          password: data.password,
          domain: data.domain || undefined,
          description: data.description || undefined,
          notes: data.notes || undefined,
          expiresAt: data.expiresAt?.toISOString(),
          isPrivate: finalIsPrivate,
          shareWithGroupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
          shareWithUserIds: selectedUserIds.length > 0 ? selectedUserIds : undefined,
          servers: selectedServers.length > 0 ? selectedServers : undefined
        };
        await vaultApi.createCredential(createRequest);
        toast.success('Credencial creada', {
          description: 'La credencial se creó correctamente.'
        });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'No se pudo guardar la credencial'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Credencial' : 'Nueva Credencial'}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Modifica los datos de la credencial. Deja el campo de contraseña vacío para mantener la actual.'
              : 'Ingresa los datos de la nueva credencial. Todos los campos marcados con * son obligatorios.'
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Nombre */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: SA Producción" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tipo de credencial */}
            <FormField
              control={form.control}
              name="credentialType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="SqlAuth">SQL Server Authentication</SelectItem>
                      <SelectItem value="WindowsAD">Windows / Active Directory</SelectItem>
                      <SelectItem value="Other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dominio (solo para Windows) */}
            {form.watch('credentialType') === 'WindowsAD' && (
              <FormField
                control={form.control}
                name="domain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dominio</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: GSCORP" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Usuario */}
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usuario *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: sa o TB03260" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Contraseña */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEditing ? 'Nueva Contraseña' : 'Contraseña *'}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder={isEditing ? 'Dejar vacío para mantener la actual' : 'Ingresa la contraseña'}
                      showStrengthIndicator={!isEditing || !!field.value}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Descripción */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input placeholder="Descripción breve" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notas */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Información adicional, instrucciones, etc."
                      className="min-h-[80px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Fecha de expiración */}
            <FormField
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha de expiración</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP", { locale: es })
                          ) : (
                            <span>Sin fecha de expiración</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                      {field.value && (
                        <div className="p-2 border-t">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => field.onChange(undefined)}
                          >
                            Quitar fecha
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Opcional. Te alertaremos 30 días antes de la expiración.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Info: Las credenciales siempre son privadas */}
            <div className="flex flex-row items-center gap-3 rounded-lg border p-4 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200">
              <Lock className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Credencial privada</p>
                <p className="text-xs text-muted-foreground">
                  Solo tú y las personas/grupos con quienes compartas podrán ver esta credencial.
                </p>
              </div>
            </div>

            {/* Compartir con grupos y/o usuarios (solo en creación) */}
            {!isEditing && (availableGroups.length > 0 || availableUsers.length > 0) && (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Compartir credencial (opcional)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecciona grupos y/o usuarios que podrán acceder a esta credencial.
                </p>
                
                {/* Compartir con grupos */}
                {availableGroups.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FolderLock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Grupos</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {availableGroups.map(group => {
                        const isSelected = selectedGroupIds.includes(group.id);
                        return (
                          <Badge
                            key={group.id}
                            variant={isSelected ? 'default' : 'outline'}
                            className="cursor-pointer hover:bg-primary/20 transition-colors"
                            style={isSelected ? { backgroundColor: group.color || undefined } : undefined}
                            onClick={() => {
                              setSelectedGroupIds(prev => 
                                isSelected 
                                  ? prev.filter(id => id !== group.id)
                                  : [...prev, group.id]
                              );
                            }}
                          >
                            {isSelected && <Check className="h-3 w-3 mr-1" />}
                            {group.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Compartir con usuarios */}
                {availableUsers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Usuarios</span>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
                      {availableUsers.map(user => {
                        const isSelected = selectedUserIds.includes(user.id);
                        return (
                          <Badge
                            key={user.id}
                            variant={isSelected ? 'default' : 'outline'}
                            className="cursor-pointer hover:bg-primary/20 transition-colors"
                            onClick={() => {
                              setSelectedUserIds(prev => 
                                isSelected 
                                  ? prev.filter(id => id !== user.id)
                                  : [...prev, user.id]
                              );
                            }}
                          >
                            {isSelected && <Check className="h-3 w-3 mr-1" />}
                            {user.displayName || user.userName}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Resumen de selección */}
                {(selectedGroupIds.length > 0 || selectedUserIds.length > 0) && (
                  <p className="text-xs text-muted-foreground pt-2 border-t">
                    Compartiendo con: {selectedGroupIds.length} grupo(s), {selectedUserIds.length} usuario(s)
                  </p>
                )}
              </div>
            )}

            {/* Servidores asociados (solo en creación) */}
            {!isEditing && (
              <ServerSelector
                availableServers={availableServers}
                selectedServers={selectedServers}
                onSelectionChange={setSelectedServers}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Guardar cambios' : 'Crear credencial'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CredentialDialog;

