# -*- coding: utf-8 -*-
import logging
from pathlib import Path

from fastapi import APIRouter
from langchain.prompts import ChatPromptTemplate

from api.dependencies.ik_api import IkApiDep
from common.mail_utils import get_mail, extract_unique_emails, remove_lines_starting_with_prefixes, clean_text
from models.request.mail import MailEventSuggestionRequest
from models.response.mail import EventResponse
from openai_clients import client_from_config

logger = logging.getLogger(__name__)

router = APIRouter(
        tags=["mail"],
        )

EVENT_PROMPT = ChatPromptTemplate([
    ("system", """
You are an efficient and straight-to-the-point assistant that analyzes emails and prepares structured event information.
- email : You will read the following email (including headers) and extract relevant information.

- category: You need to determinate if the mail the category of the mail. Like if the mail is about work, social, newsletter, spam.

- urgency_scoreYou will need to determinate the urgency of the mail if it's an import mail to response ASAP or not.

output a JSON-formatted string containing the following fields matching the EventResponse model: 'emails', 'sender', 'category', 'urgency_score', 'locations', 'persons'.

Instructions for each field:
* 'emails': list of participant emails found in the 'From' and 'To' fields of the email headers.
* 'sender': name of the person or company that send the mail
* 'category': classify the email as one of 'work' | 'social' | 'spam' | 'newsletter'.
* 'urgency_score': integer from 0 to 10000 indicating how urgent it is to answer.
* 'locations': a list of any place or location mentioned in the message. If there are none, leave the list empty.
* 'persons': a list of any person mentioned in the message. If there are none, leave the list empty.

The JSON output must strictly follow this schema. Do not add extra text outside the JSON object.
"""),
    ("human", """Mail conversation: {text}
JSON-formatted calendar invitation:""")
    ])

event_client = client_from_config(model="qwen3", temprature=0.12, max_tokens=5000)
event_chain = EVENT_PROMPT | event_client.with_structured_output(EventResponse)


@router.post(
        "/mail/{mailbox_uuid}/folder/{folder_id}/thread/{thread_id}/event_suggestion",
        response_model=EventResponse,
        responses={400: {"description": "Bad Request"}},
        operation_id="event_suggestion",
        summary="Suggest an event",
        description=Path("common/docs/event_suggestion.md").read_text(),
        )
async def event_suggestion(
        mailbox_uuid: str,
        folder_id: str,
        thread_id: str,
        request: MailEventSuggestionRequest,
        ik_api: IkApiDep
        ) -> EventResponse:
    """

    Args:
        request:
        ik_api:

    Returns:

    """
    logger.info(f"Request for mailbox uuid: {mailbox_uuid}")
    mails = await get_mail(request.context_message_uid, ik_api, mailbox_uuid)
    email_sep = "\n---------------------------------------\n"
    text = ""
    emails = set()
    subject = None
    for mail in mails:
        if mail:
            date = mail.data.date.strftime("%A %d. %B %Y")
            from_item = mail.data.from_[0]
            from_display = f"{from_item.name} ({from_item.email})"
            to_cc_items = mail.data.to + mail.data.cc
            body = mail.data.body.value
            to_display = ", ".join([f"{r.name} ({r.email})" for r in to_cc_items])
            text += f"From: {from_display}\nTo: {to_display}\nDate: {date}\nE-mail: {body}{email_sep}"
            if subject is None:
                subject = mail.data.subject

            # Update email list
            field_emails = [str(item.email) for item in [from_item] + to_cc_items]
            parsed_emails = extract_unique_emails(body)
            emails.update(field_emails + parsed_emails)

    text = f"Subject: {subject}\n\n{text}"
    text = remove_lines_starting_with_prefixes(text, [">"])
    text = clean_text(text)

    result = event_chain.invoke(
            {"emails": ", ".join(emails), "text": text}
            )

    valid_emails = [email for email in result.emails if email in emails]
    result.emails = valid_emails
    return result
