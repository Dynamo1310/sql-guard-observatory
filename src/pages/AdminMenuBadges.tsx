import { useEffect, useState } from 'react';
import { Sparkles, Save, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { menuBadgesApi, MenuBadgeDto, UpdateMenuBadgeRequest } from '@/services/api';

const colorOptions = [
  { value: 'green', label: 'Verde', hex: '#22c55e' },
  { value: 'blue', label: 'Azul', hex: '#3b82f6' },
  { value: 'purple', label: 'Morado', hex: '#a855f7' },
  { value: 'orange', label: 'Naranja', hex: '#f97316' },
  { value: 'red', label: 'Rojo', hex: '#ef4444' },
  { value: 'yellow', label: 'Amarillo', hex: '#eab308' },
  { value: 'pink', label: 'Rosa', hex: '#ec4899' },
  { value: 'teal', label: 'Turquesa', hex: '#14b8a6' },
];

export default function AdminMenuBadges() {
  const [badges, setBadges] = useState<MenuBadgeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Map<string, Partial<MenuBadgeDto>>>(new Map());

  useEffect(() => {
    loadBadges();
  }, []);

  const loadBadges = async () => {
    try {
      setLoading(true);
      const data = await menuBadgesApi.getAllBadges();
      setBadges(data);
      setChanges(new Map());
    } catch (err: any) {
      toast.error('Error al cargar badges: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (menuKey: string, currentValue: boolean) => {
    const newChanges = new Map(changes);
    const existing = newChanges.get(menuKey) || {};
    newChanges.set(menuKey, { ...existing, isNew: !currentValue });
    setChanges(newChanges);

    setBadges(prev =>
      prev.map(b =>
        b.menuKey === menuKey ? { ...b, isNew: !currentValue } : b
      )
    );
  };

  const handleTextChange = (menuKey: string, badgeText: string) => {
    const newChanges = new Map(changes);
    const existing = newChanges.get(menuKey) || {};
    newChanges.set(menuKey, { ...existing, badgeText });
    setChanges(newChanges);

    setBadges(prev =>
      prev.map(b =>
        b.menuKey === menuKey ? { ...b, badgeText } : b
      )
    );
  };

  const handleColorChange = (menuKey: string, badgeColor: string) => {
    const newChanges = new Map(changes);
    const existing = newChanges.get(menuKey) || {};
    newChanges.set(menuKey, { ...existing, badgeColor });
    setChanges(newChanges);

    setBadges(prev =>
      prev.map(b =>
        b.menuKey === menuKey ? { ...b, badgeColor } : b
      )
    );
  };

  const handleSave = async () => {
    if (changes.size === 0) {
      toast.info('No hay cambios para guardar');
      return;
    }

    setSaving(true);
    try {
      const requests: UpdateMenuBadgeRequest[] = [];
      
      for (const [menuKey, change] of changes.entries()) {
        const badge = badges.find(b => b.menuKey === menuKey);
        if (badge) {
          requests.push({
            menuKey,
            isNew: change.isNew ?? badge.isNew,
            badgeText: change.badgeText ?? badge.badgeText,
            badgeColor: change.badgeColor ?? badge.badgeColor,
          });
        }
      }

      await menuBadgesApi.updateAllBadges(requests);
      toast.success('Badges actualizados correctamente');
      setChanges(new Map());
      loadBadges();
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleActivateAll = () => {
    const newChanges = new Map<string, Partial<MenuBadgeDto>>();
    badges.forEach(b => {
      newChanges.set(b.menuKey, { isNew: true });
    });
    setChanges(newChanges);
    setBadges(prev => prev.map(b => ({ ...b, isNew: true })));
  };

  const handleDeactivateAll = () => {
    const newChanges = new Map<string, Partial<MenuBadgeDto>>();
    badges.forEach(b => {
      newChanges.set(b.menuKey, { isNew: false });
    });
    setChanges(newChanges);
    setBadges(prev => prev.map(b => ({ ...b, isNew: false })));
  };

  const getBadgeColorHex = (color: string) => {
    const option = colorOptions.find(o => o.value === color);
    return option?.hex || '#22c55e';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Cargando configuración...</div>
        </div>
      </div>
    );
  }

  const hasChanges = changes.size > 0;
  const activeCount = badges.filter(b => b.isNew).length;

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-green-500" />
            Indicadores de Menú
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Configura qué menús muestran el indicador "Nuevo" en el sidebar
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleActivateAll}>
            Activar Todos
          </Button>
          <Button variant="outline" size="sm" onClick={handleDeactivateAll}>
            Desactivar Todos
          </Button>
          <Button variant="outline" size="sm" onClick={loadBadges}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Recargar
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-500">{activeCount}</div>
            <div className="text-sm text-muted-foreground">Menús con badge activo</div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{badges.length}</div>
            <div className="text-sm text-muted-foreground">Total de menús</div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-500">{changes.size}</div>
            <div className="text-sm text-muted-foreground">Cambios pendientes</div>
          </CardContent>
        </Card>
      </div>

      {/* Badges Configuration - Agrupados por categoría */}
      {(() => {
        // Agrupar badges por categoría
        const badgesByCategory = badges.reduce((acc, badge) => {
          const category = badge.category || 'Otros';
          if (!acc[category]) acc[category] = [];
          acc[category].push(badge);
          return acc;
        }, {} as Record<string, MenuBadgeDto[]>);

        // Orden de categorías
        const categoryOrder = ['Observabilidad', 'Parcheos', 'Guardias DBA', 'Operaciones', 'Seguridad', 'Administración', 'Otros'];
        const sortedCategories = Object.keys(badgesByCategory).sort((a, b) => {
          const indexA = categoryOrder.indexOf(a);
          const indexB = categoryOrder.indexOf(b);
          if (indexA === -1 && indexB === -1) return a.localeCompare(b);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });

        const getCategoryColor = (category: string) => {
          switch (category) {
            case 'Observabilidad': return 'border-blue-500/50 bg-blue-500/5';
            case 'Parcheos': return 'border-indigo-500/50 bg-indigo-500/5';
            case 'Guardias DBA': return 'border-teal-500/50 bg-teal-500/5';
            case 'Operaciones': return 'border-orange-500/50 bg-orange-500/5';
            case 'Seguridad': return 'border-amber-500/50 bg-amber-500/5';
            case 'Administración': return 'border-purple-500/50 bg-purple-500/5';
            default: return 'border-gray-500/50 bg-gray-500/5';
          }
        };

        return sortedCategories.map((category) => (
          <Card key={category} className={`border-l-4 ${getCategoryColor(category)}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{category}</CardTitle>
                <span className="text-sm text-muted-foreground">
                  {badgesByCategory[category].filter(b => b.isNew).length} / {badgesByCategory[category].length} activos
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {badgesByCategory[category].map((badge) => {
                  const isModified = changes.has(badge.menuKey);
                  const isMainMenu = badge.displayName.startsWith('📁');
                  
                  return (
                    <div 
                      key={badge.menuKey} 
                      className={`relative p-3 rounded-lg border transition-all ${
                        isModified ? 'ring-2 ring-yellow-400 dark:ring-yellow-600' : ''
                      } ${badge.isNew ? 'bg-green-500/5 border-green-500/30' : 'bg-muted/30 border-transparent'} ${
                        isMainMenu ? 'col-span-1 md:col-span-2 lg:col-span-1' : ''
                      }`}
                    >
                      {/* Header con toggle */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`text-sm truncate ${isMainMenu ? 'font-semibold' : ''}`} title={badge.displayName}>
                            {badge.displayName}
                          </span>
                          {badge.isNew && (
                            <Badge className="text-white text-[9px] px-1 py-0 flex-shrink-0" style={{ backgroundColor: getBadgeColorHex(badge.badgeColor) }}>
                              {badge.badgeText}
                            </Badge>
                          )}
                        </div>
                        <button
                          onClick={() => handleToggle(badge.menuKey, badge.isNew)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                            badge.isNew ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              badge.isNew ? 'translate-x-4' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Configuración adicional (solo visible si está activo) */}
                      {badge.isNew && (
                        <div className="mt-3 pt-3 border-t border-dashed space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={badge.badgeText}
                              onChange={(e) => handleTextChange(badge.menuKey, e.target.value)}
                              placeholder="Nuevo"
                              className="h-7 text-xs flex-1"
                              maxLength={15}
                            />
                            <div className="flex gap-0.5">
                              {colorOptions.slice(0, 4).map((color) => (
                                <button
                                  key={color.value}
                                  onClick={() => handleColorChange(badge.menuKey, color.value)}
                                  className={`w-5 h-5 rounded-full transition-all ${
                                    badge.badgeColor === color.value 
                                      ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' 
                                      : 'opacity-50 hover:opacity-100'
                                  }`}
                                  style={{ backgroundColor: color.hex }}
                                  title={color.label}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-0.5">
                            {colorOptions.slice(4).map((color) => (
                              <button
                                key={color.value}
                                onClick={() => handleColorChange(badge.menuKey, color.value)}
                                className={`w-5 h-5 rounded-full transition-all ${
                                  badge.badgeColor === color.value 
                                    ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' 
                                    : 'opacity-50 hover:opacity-100'
                                }`}
                                style={{ backgroundColor: color.hex }}
                                title={color.label}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Indicador de modificado */}
                      {isModified && (
                        <div className="absolute top-1 right-1">
                          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ));
      })()}

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Vista Previa</CardTitle>
          <CardDescription>
            Así se verán los badges en el sidebar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-sidebar rounded-lg p-4 space-y-2 max-w-xs">
            {badges.filter(b => b.isNew).map((badge) => (
              <div 
                key={badge.menuKey}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-sidebar-accent/30"
              >
                <span className="text-sm">{badge.displayName}</span>
                <Badge className="text-white text-[10px] px-1.5 py-0" style={{ backgroundColor: getBadgeColorHex(badge.badgeColor) }}>
                  {badge.badgeText}
                </Badge>
              </div>
            ))}
            {badges.filter(b => b.isNew).length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                No hay badges activos
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

