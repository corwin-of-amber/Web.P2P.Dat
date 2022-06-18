import { EventEmitter } from 'events';


class EventHook {
    receiver: EventEmitter = undefined
    eventType: string = undefined
    handler: Callback = undefined

    attach(receiver: EventEmitter, eventType: string, handler: Callback)
    {
        this.detach();
        this.receiver = receiver;
        this.eventType = eventType;
        this.handler = handler;
        this.receiver.on(this.eventType, this.handler);
        return this;
    }

    detach() {
        if (this.receiver) {
            this.receiver.off(this.eventType, this.handler);
            this.receiver = this.eventType = this.handler = undefined;
        }
        return this;
    }
}

type Callback = (...a: any[]) => void;


export { EventHook }