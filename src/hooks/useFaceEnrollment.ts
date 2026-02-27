import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import type { FaceDetectionResult } from "@/hooks/useFaceRecognition";

export function useFaceEnrollment() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const enroll = async (result: FaceDetectionResult, targetUserId?: string) => {
    setEnrolling(true);
    try {
      // Upload photo to storage
      let photoUrl: string | null = null;
      const userId = targetUserId || profile?.id;
      if (result.imageDataUrl && userId) {
        const blob = await fetch(result.imageDataUrl).then((r) => r.blob());
        const filePath = `${userId}/face-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("face-photos")
          .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });
        if (!uploadError) {
          photoUrl = filePath;
        }
      }

      // Call edge function
      const { data, error } = await supabase.functions.invoke("face_enroll", {
        body: {
          action: "enroll",
          target_user_id: targetUserId || undefined,
          descriptor: Array.from(result.descriptor),
          photo_url: photoUrl,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast({
        title: lang === "es" ? "Rostro registrado" : "Face enrolled",
        description: lang === "es" ? "El reconocimiento facial está listo" : "Face recognition is ready",
      });

      return data.data;
    } catch (e) {
      toast({
        title: lang === "es" ? "Error al registrar" : "Enrollment error",
        description: (e as Error).message,
        variant: "destructive",
      });
      return null;
    } finally {
      setEnrolling(false);
    }
  };

  const verify = async (result: FaceDetectionResult): Promise<{ match: boolean; confidence: number } | null> => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("face_enroll", {
        body: {
          action: "verify",
          descriptor: Array.from(result.descriptor),
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data.data;
    } catch (e) {
      toast({
        title: lang === "es" ? "Error de verificación" : "Verification error",
        description: (e as Error).message,
        variant: "destructive",
      });
      return null;
    } finally {
      setVerifying(false);
    }
  };

  const checkStatus = async (targetUserId?: string): Promise<{ enrolled: boolean } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("face_enroll", {
        body: {
          action: "status",
          target_user_id: targetUserId || undefined,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch {
      return null;
    }
  };

  return { enroll, verify, checkStatus, enrolling, verifying };
}
