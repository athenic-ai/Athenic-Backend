-- Add todo object type
INSERT INTO public.object_types (id, name, description, created_at, name_plural, icon, category, visible)
VALUES ('todo', 'Todo', 'A task that needs to be completed', now(), 'Todos', 'solid list-check', 'organisation_data_standard', true);

-- Add todo metadata types
INSERT INTO public.object_metadata_types (id, name, description, created_at, allow_ai_update, related_object_type_id, is_required, field_type_id, is_visible, order_priority)
VALUES 
('title', 'Title', 'The title of the todo', now(), true, 'todo', true, 'text', true, 1),
('created_at', 'Created', 'When the todo was created', now(), false, 'todo', true, 'timestamp', true, 2),
('description', 'Description', 'A detailed description of what needs to be done', now(), true, 'todo', false, 'text', true, 3),
('due_date', 'Due Date', 'When the todo should be completed by', now(), true, 'todo', false, 'timestamp', true, 4),
('status', 'Status', 'The current status of the todo', now(), true, 'todo', true, 'text', true, 5),
('priority', 'Priority', 'The priority level of the todo', now(), true, 'todo', false, 'text', true, 6);

-- Add capabilities metadata field for assistant object type
-- This will store the assistant's specialized capabilities like todo management
INSERT INTO public.object_metadata_types (id, name, description, created_at, allow_ai_update, related_object_type_id, is_required, field_type_id, is_visible, order_priority)
VALUES ('capabilities', 'Capabilities', 'Specialized capabilities this assistant has', now(), true, 'assistant', false, 'text', true, 10);

-- Add dictionary terms for todo statuses
INSERT INTO public.dictionary_terms (id, type, description, pretty_name, value, colour)
VALUES 
('todo_status_not_started', 'taskTypes', 'Todo not yet started', 'Not Started', 1, 4294941057),
('todo_status_in_progress', 'taskTypes', 'Todo in progress', 'In Progress', 2, 4294940672),
('todo_status_completed', 'taskTypes', 'Todo completed', 'Completed', 3, 4294938880);

-- Add dictionary terms for todo priorities
INSERT INTO public.dictionary_terms (id, type, description, pretty_name, value, colour)
VALUES 
('todo_priority_low', 'taskTypes', 'Low priority todo', 'Low', 1, 4284387342),
('todo_priority_medium', 'taskTypes', 'Medium priority todo', 'Medium', 2, 4294942413),
('todo_priority_high', 'taskTypes', 'High priority todo', 'High', 3, 4294938880); 