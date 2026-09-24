<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Every email the system sends: routing notices to staff, the sign-in alert, and the Supplier Portal
 * links. Queued, so a slow or unreachable mail server never holds up the approval that triggered it.
 */
class SystemMessage extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public string $heading,
        public ?string $body = null,
        public ?string $actionUrl = null,
        public ?string $actionLabel = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->heading);
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.system-message',
            text: 'mail.system-message-text',
            with: [
                'heading' => $this->heading,
                'lines' => preg_split("/\r\n|\n/", trim((string) $this->body)) ?: [],
                'actionUrl' => $this->actionUrl,
                'actionLabel' => $this->actionLabel ?: 'Open in the Procurement System',
                'agency' => config('app.name'),
            ],
        );
    }
}
