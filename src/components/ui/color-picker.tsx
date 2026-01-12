import { useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Colores predefinidos para selección rápida
const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#78716c', '#64748b', '#1e293b',
];

interface ColorPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  color: string;
  onColorChange: (color: string) => void;
  title?: string;
  description?: string;
}

export function ColorPickerDialog({
  open,
  onOpenChange,
  color,
  onColorChange,
  title = 'Seleccionar Color',
  description = 'Arrastrá el puntero sobre el cuadrado para seleccionar cualquier color de la gama RGB',
}: ColorPickerDialogProps) {
  const [tempColor, setTempColor] = useState(color);

  // Sincronizar cuando se abre el dialog
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setTempColor(color);
    }
    onOpenChange(isOpen);
  };

  const handleConfirm = () => {
    onColorChange(tempColor);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div 
              className="w-6 h-6 rounded-full border-2 border-border"
              style={{ backgroundColor: tempColor }}
            />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selector RGB visual completo */}
          <div className="flex justify-center">
            <HexColorPicker 
              color={tempColor} 
              onChange={setTempColor}
              style={{ width: '100%', height: '200px' }}
            />
          </div>

          {/* Input hexadecimal */}
          <div className="flex items-center gap-3">
            <Label htmlFor="hex-input" className="text-sm font-medium">
              Código HEX:
            </Label>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-muted-foreground">#</span>
              <HexColorInput
                color={tempColor}
                onChange={setTempColor}
                prefixed={false}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring uppercase font-mono"
              />
            </div>
            <div 
              className="w-9 h-9 rounded-md border-2 border-border shadow-sm"
              style={{ backgroundColor: tempColor }}
            />
          </div>

          {/* Colores predefinidos */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Colores predefinidos:</Label>
            <div className="grid grid-cols-10 gap-2">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  onClick={() => setTempColor(presetColor)}
                  className={cn(
                    'w-7 h-7 rounded-md border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    tempColor.toLowerCase() === presetColor.toLowerCase() 
                      ? 'border-foreground ring-2 ring-primary' 
                      : 'border-transparent hover:border-muted-foreground/50'
                  )}
                  style={{ backgroundColor: presetColor }}
                  title={presetColor}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            Confirmar Color
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ColorPickerButtonProps {
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  dialogTitle?: string;
  dialogDescription?: string;
}

export function ColorPickerButton({
  color,
  onChange,
  disabled = false,
  className,
  title = 'Cambiar color',
  dialogTitle,
  dialogDescription,
}: ColorPickerButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={cn(
          'w-8 h-8 rounded-full border-2 border-border transition-all hover:scale-110 hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          disabled && 'opacity-50 cursor-not-allowed hover:scale-100',
          className
        )}
        style={{ backgroundColor: color }}
        title={title}
      />
      <ColorPickerDialog
        open={open}
        onOpenChange={setOpen}
        color={color}
        onColorChange={onChange}
        title={dialogTitle}
        description={dialogDescription}
      />
    </>
  );
}



