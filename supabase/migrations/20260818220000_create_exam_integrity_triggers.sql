-- Migration: 20260818220000_create_exam_integrity_triggers.sql
-- Description: Create triggers and functions to automatically evaluate participant risk and process heartbeats on insert.

-- 1. Function to calculate participant risk
CREATE OR REPLACE FUNCTION public.calculate_participant_risk()
RETURNS TRIGGER AS $$
DECLARE
  v_session_id UUID;
  v_participant_id UUID;
  v_event_type TEXT;
  v_risk_increment FLOAT;
  v_base_increment FLOAT;
  v_event_count INTEGER;
  v_new_score FLOAT;
  v_new_level TEXT;
BEGIN
  -- Get context
  v_session_id := NEW.session_id;
  v_participant_id := NEW.participant_id;
  v_event_type := NEW.event_type;

  -- Determine base increment for this event type
  v_base_increment := CASE v_event_type
    WHEN 'FULLSCREEN_EXITED' THEN 15.0
    WHEN 'PAGE_HIDDEN' THEN 12.0
    WHEN 'WINDOW_BLUR' THEN 8.0
    WHEN 'COPY_ATTEMPT' THEN 10.0
    WHEN 'RIGHT_CLICK' THEN 5.0
    ELSE 0.0
  END;

  -- If it's not a risk-increasing event, exit early
  IF v_base_increment = 0.0 THEN
    RETURN NEW;
  END IF;

  -- Count how many times this specific event type has occurred for this participant in this session
  -- (Note: since this is an AFTER INSERT trigger, the current row is already included in the count)
  SELECT COUNT(*) INTO v_event_count
  FROM public.exam_integrity_events
  WHERE participant_id = v_participant_id 
    AND session_id = v_session_id 
    AND event_type = v_event_type;

  -- Compounding penalty multiplier: base * (1.2 ^ (count - 1))
  v_risk_increment := v_base_increment * POWER(1.2, GREATEST(0, v_event_count - 1));

  -- Get current risk score of participant
  SELECT COALESCE(risk_score, 0.0) INTO v_new_score
  FROM public.participants
  WHERE id = v_participant_id;

  -- Add increment
  v_new_score := v_new_score + v_risk_increment;

  -- Determine the risk level category
  v_new_level := CASE 
    WHEN v_new_score < 25.0 THEN 'low'
    WHEN v_new_score < 60.0 THEN 'medium'
    ELSE 'high'
  END;

  -- Update participant record
  UPDATE public.participants
  SET 
    risk_score = v_new_score,
    risk_level = v_new_level
  WHERE id = v_participant_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for risk evaluation
CREATE OR REPLACE TRIGGER trigger_calculate_risk
  AFTER INSERT ON public.exam_integrity_events
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_participant_risk();

-- 2. Function to process participant heartbeat status
CREATE OR REPLACE FUNCTION public.process_participant_heartbeat()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- Determine network status based on latency
  -- stable: latency <= 250ms
  -- unstable: latency > 250ms
  v_status := CASE 
    WHEN NEW.latency_ms IS NULL THEN 'stable'
    WHEN NEW.latency_ms <= 250 THEN 'stable'
    ELSE 'unstable'
  END;

  -- Update status column
  NEW.status := v_status;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for heartbeat status processing
CREATE OR REPLACE TRIGGER trigger_process_heartbeat
  BEFORE INSERT ON public.exam_heartbeats
  FOR EACH ROW
  EXECUTE FUNCTION public.process_participant_heartbeat();
