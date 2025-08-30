# -*- coding: utf-8 -*-
import datetime
import json
import logging
import re
from typing import List, Optional

from langchain_core.messages import AIMessage
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger()


class EventResponse(BaseModel):
    """Relevant information to set a new event"""

    emails: List[str] = Field(..., description=(
        "List of relevant participants e-mails found in the 'From' and 'To' fields before every e-mail content"), )
    title: str = Field(..., description="Title of the event based on the objectives described in the conversation", )
    message: str = Field(..., description="the message of the email")
    category: str = Field(..., description="What is the mail about")
    urgency_score: int = Field(..., description="Range of how the message is urgent to answer")
    places: str = Field(..., description= "Locations mentioned in the mail" )
    persons: str = Field(..., description="Names mentioned in the mail")

    @classmethod
    def _parse_duration(cls, duration_value, fallback_duration):
        """Parse duration value with default fallback to 60 minutes (1 hour)."""
        if duration_value is None:
            return fallback_duration if fallback_duration is not None else 60

        try:
            # Extract digits from the duration value
            duration_str = "".join(filter(str.isdigit, str(duration_value)))
            if not duration_str:
                return 60  # Default to 1 hour if no digits found

            duration_int = int(duration_str)
            # Validate that duration is reasonable (between 1 minute and 24 hours)
            if duration_int < 1 or duration_int > 1440:
                return 60  # Default to 1 hour for invalid ranges

            return duration_int
        except (ValueError, TypeError):
            return 60  # Default to 1 hour for any parsing errors

    @classmethod
    def correct_json(cls, validator_string: AIMessage, first_answer: "EventResponse"):
        if "```valid```" in validator_string.content.lower():
            return first_answer
        try:
            # Extract JSON from between triple backticks if present
            json_pattern = re.search(r"```(?:json)?\s*([\s\S]*?)```", validator_string.content)
            if json_pattern:
                # Use the content between backticks
                cleaned_json = json_pattern.group(1).strip()
            else:
                # If no backticks found, just clean up the raw string
                cleaned_json = re.sub(r"json\n", "", validator_string.strip())

            # Parse JSON
            data = json.loads(cleaned_json)

            # Create a new instance with values from the JSON or fallback to first_answer
            return cls(emails=data.get("emails", first_answer.emails), title=data.get("title", first_answer.title),
                       message=data.get("message", first_answer.message),
                       category=data.get("category", first_answer.category),
                       urgency_score=data.get("urgency_score", first_answer.urgency_score),
                       )
        except (json.JSONDecodeError, AttributeError, KeyError, TypeError, ValidationError,) as e:
            # If JSON is invalid or missing required fields, return the first_answer
            logger.error(f"Error parsing JSON: {e}. Using fallback values.")
            return first_answer


class MailBox(BaseModel):
    uuid: str
    email: str
    mailbox: str


class MailBoxResponse(BaseModel):
    data: list[MailBox]
    result: str


class EmailAddress(BaseModel):
    email: str
    name: str


class ThreadMessageBody(BaseModel):
    type: str
    value: str


class ThreadMessage(BaseModel):
    uid: str
    msg_id: str
    date: datetime.datetime
    subject: str
    from_: list[EmailAddress] = Field(alias="from")
    to: list[EmailAddress]
    cc: list[EmailAddress]
    bcc: list[EmailAddress]
    priority: str
    resource: str  # url
    download_resource: str  # url
    has_attachments: bool
    seen: bool
    forwarded: bool
    answered: bool
    flagged: bool
    preview: str
    body: Optional[ThreadMessageBody] = None

    @property
    def message_id(self) -> str:
        """Extract message ID from UID."""
        return self.uid.split("@")[0] if "@" in self.uid else self.uid

class Thread(BaseModel):
    uid: str
    from_: list[EmailAddress] = Field(alias="from")
    to: list[EmailAddress]
    cc: list[EmailAddress]
    bcc: list[EmailAddress]
    date: datetime.datetime
    subject: str
    messages: list[ThreadMessage]


class ListEmailsResponseData(BaseModel):
    messages_count: int
    threads: list[Thread] = Field(default_factory=list)


class ListEmailsResponse(BaseModel):
    data: ListEmailsResponseData
    result: str


class MailFolder(BaseModel):
    id: str
    name: str


class MailFolderResponse(BaseModel):
    data: list[MailFolder]
    result: str

class GetEmailResponse(BaseModel):
    data: ThreadMessage
    result: str
