'use client'

import { useEffect, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScanSuccess: (decodedText: string) => void
}

export default function QRScannerModal({ isOpen, onClose, onScanSuccess }: QRScannerModalProps) {
  const [scannerError, setScannerError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    let html5QrcodeScanner: Html5Qrcode | null = null

    // Inicializar el escáner una vez montado el modal
    const timer = setTimeout(async () => {
      try {
        html5QrcodeScanner = new Html5Qrcode('qr-reader-container')
        await html5QrcodeScanner.start(
          { facingMode: 'environment' }, // Usa cámara trasera del móvil por defecto
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
          },
          (decodedText) => {
            onScanSuccess(decodedText)
            if (html5QrcodeScanner?.isScanning) {
              html5QrcodeScanner.stop().catch(() => {})
            }
            onClose()
          },
          (errorMessage) => {
            // Ignorar errores de frame no encontrado durante escaneo activo
          }
        )
      } catch (err: any) {
        setScannerError('No se pudo acceder a la cámara. Asegúrate de dar permisos de cámara a tu navegador.')
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop().catch(() => {})
      }
    }
  }, [isOpen, onClose, onScanSuccess])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4 text-center relative">
        <button
          onClick={() => {
            onClose()
          }}
          className="absolute top-3 right-3 text-slate-400 hover:text-white p-2 rounded-lg text-lg"
        >
          ✕
        </button>

        <div>
          <h3 className="text-base font-bold text-slate-100">Escaneando Código QR</h3>
          <p className="text-xs text-slate-400 mt-1">Apunta la cámara trasera hacia el QR del cliente</p>
        </div>

        {scannerError ? (
          <div className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-red-200 text-xs">
            {scannerError}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-black min-h-[260px] flex items-center justify-center">
            <div id="qr-reader-container" className="w-full"></div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
        >
          Cancelar Escaneo
        </button>
      </div>
    </div>
  )
}
