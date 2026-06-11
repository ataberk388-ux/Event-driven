-- LISTEN/NOTIFY replaces Kafka: the worker LISTENs on "outbox_event" and drains
-- pending rows whenever one is inserted (plus a safety poll).

CREATE OR REPLACE FUNCTION notify_outbox_event() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('outbox_event', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outbox_event_notify
AFTER INSERT ON outbox_events
FOR EACH ROW EXECUTE FUNCTION notify_outbox_event();
