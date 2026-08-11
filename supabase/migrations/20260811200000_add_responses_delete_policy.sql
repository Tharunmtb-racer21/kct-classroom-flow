-- Allow faculty/session creators to delete responses for their session questions
DROP POLICY IF EXISTS "Faculty delete responses of own sessions" ON public.responses;

CREATE POLICY "Faculty delete responses of own sessions" ON public.responses 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.sessions s ON s.id = q.session_id
    WHERE q.id = responses.question_id
    AND s.creator_id = public.auth_uid()
  )
);
