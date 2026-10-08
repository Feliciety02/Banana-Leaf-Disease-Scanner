# DahonMD user flows by role

Current implementation map for the Android app, connected website, and Laravel API (October 7, 2026). Open the matching [editable draw.io diagram](dahonmd-role-user-flows-2026-10-07.drawio). Pages 1–8 show the main paths and cross-role states; pages 9–16 show detailed journeys. Use the [screen-by-screen journey checklist](ROLE_JOURNEY_DETAILS.md) for every exposed role area and meaningful branch.

## Where each role starts

| Role | Android navigation | Website navigation | Access rule |
| --- | --- | --- | --- |
| Guest | Scan, History, Guide, Account | Public landing, screening, login/signup | No account for Android classification or local history. Web screening needs the connected inference service; saving needs a farmer login. |
| Farmer | Home, Scan, History, Guide, Account | Home, Scan, History, Guide/Library, Profile | Own scans, review requests, consent, and account settings only. |
| Agriculturist | Home, Reviewed, Content, Guide, Account; the Home screen opens review requests | Home, Review Queue, Reviewed Cases, Disease Knowledge, Research Sources, Article Library, Dataset Candidates, Profile | Verified staff account required for expert APIs. |
| Administrator | Home, Users, Scans, Knowledge, Account | Dashboard, Accounts, Diagnoses, Disease Knowledge, Research Sources, Article Library, Dataset Candidates, Analytics, Model Comparison, Model Information, Profile | Verified admin account required for admin APIs. The website exposes more admin tools than Android. |

There is no separate researcher login. The four model classes are Healthy, Sigatoka, Panama disease, and Cordana leaf spot. An AI result is a screening result; an agriculturist may confirm it, choose a different class, or say that the photo or available classes are insufficient.

## 1. Guest: first visit, scan, and account entry

| Flow | Android steps | Website steps | Branch or result |
| --- | --- | --- | --- |
| Open app | Land on Scan; use the language picker in Account if needed. | Open public landing; choose screening or Login/Sign up. | Android scanning works without server setup. |
| Scan a leaf | Scan → Camera or Gallery → Check leaf → on-device preprocessing and bundled model → result → local save. | Public Scan → photo → connected inference request → result. | Android can work in Airplane mode. Website cannot screen when its inference service is unavailable. Non-leaf rejection may ask for another photo. |
| Read result | See class, relative score, image advice, guide link, and possible retake. | See screening result, scores, and guidance when available. | Neither result is a confirmed diagnosis. A failed Android local save offers Retry save. |
| Revisit a scan | History → expand the local card; view image, guide, location and delete. | Sign in before saving the result to account history. | A guest scan remains on the phone until the farmer chooses to add it to an account. |
| Ask an expert | On the result, enter why the AI seems wrong and tap Ask an expert; sign in, then resume the result and send the request. A saved guest scan can also start from History. | Sign in and save the scan, then request review from History. An uncertain result also has a direct Save & ask an expert choice. | Expert requests require a farmer account and server connection. |
| Read guidance | Guide and bundled library content can be read on the phone. | Sign in to open the full guide and article library. | Guide content supports decisions; it does not confirm disease. |
| Create account or sign in | Account emphasizes Sign in; Create account is a smaller link. Password reset is in the login sheet. | Login or Sign up; forgot-password and verification links are available. | New signup agreement explains future research consideration. Existing accounts keep their prior sharing preference. |
| Connect phone | If connected features fail, Retry connection; scan the server QR/link or open connection settings. | Open the staged website address. | Changing a temporary server address can require a new login. Offline scanning continues. |

## 2. Farmer: scans, reviews, guidance, and account

| Flow | Steps and visible outcome | Important branch |
| --- | --- | --- |
| New Android scan | Home or Scan → Camera/Gallery → Check leaf → local result and history entry. Signed-in scans synchronize when connected. | A poor image or low score suggests a retake; classification still happens on the device. The AI result is preserved if an expert later disagrees. |
| New website scan | Scan → connected screening → Save result → History. Browser changes queue for synchronization if the connection drops after saving. | No valid screening result means no supported diagnosis is saved. Web inference needs the service. |
| Add old guest scans | Account shows **Add device scans** only when local-only scans exist; confirm the transfer. | Scans remain local until explicitly added. Sync failures remain retryable. |
| Open History | Filter scans; expand a card to see photo, AI score, review stage, and actions. Open a completed review inline beside the AI result. | Pending upload, failed sync, pending review, in-progress review, new review, and completed review are distinct states. |
| Request review | From the Android result or History, write an optional concern and tap Ask an expert; the app saves/syncs the photo and request. On the web, an uncertain result can request review directly; any saved case can request it from History. | If offline or the photo has not uploaded, retry synchronization or resend the photo. A guest must sign in first. |
| Receive review | History shows the agriculturist's conclusion, message, next steps, submitted photo, and original AI screening. Opening a new review marks it seen. | The agriculturist may choose the same class, another class, no supported disease, cannot determine, another condition, or a field/lab check. |
| Follow up | Reply on the reviewed case; optionally send a clearer photo. | The same case returns to the review queue. Its prior assessment remains in the revision trail. |
| Add location | From result/History, optionally add approximate scan location; remove it later in History. | Location is rounded to about 110 m and is not needed for classification or review. |
| Guidance and assistant | Open Guide/Library from result or navigation; ask Dahon about a synced case when signed in and connected. | AI chat is supporting information, not the agriculturist verdict. |
| Research sharing | New signup enables research consideration with disclosed terms. Account/Profile can turn future sharing off; History can withdraw an individual scan's consent. | A reviewed, photo-retained, currently consented scan enters Dataset Candidates automatically. It is not approved or used for training automatically. |
| Research copy removal | Account/Profile lists approved private research photos and lets the farmer remove one. | A separately approved copy may remain after ordinary scan deletion until the farmer removes it or chooses removal during account deletion. |
| Account maintenance | Edit name/email, password, profile photo and language; resend email verification, sign out or delete account. | Android sign-out checks unsent changes before removing local account data. The signed-out Account page concentrates on login. |

## 3. Agriculturist: case and content decisions

| Flow | Steps and visible outcome | Rule or alternative |
| --- | --- | --- |
| Start work | Sign in → Home/Review Queue → open a waiting or uncertain case. | Staff APIs require a verified account and connection. |
| Claim case | Opening a waiting case claims it; claim renews while open and releases on exit. | Another active claimant blocks a competing save. A stale claim expires. |
| Inspect evidence | View farmer photo, AI class and score, notes, prior assessments and relevant reference material; check approximate location where available. | If the photo is missing or unusable, choose Cannot determine and request a clearer image or field check. |
| Record assessment | Choose one of the four supported classes or Cannot determine, Field/laboratory check needed, or Possible other condition. Select a farmer-message template or Other text, set image quality and next steps, then save. | Same-class choice becomes `confirmed`; different class becomes `alternate_class`. Internal notes stay staff-only; farmer message is visible to the farmer. |
| Revisit reviewed cases | Open Reviewed Cases to inspect the completed answer and any prior versions. | These screens are read-only after completion. A farmer follow-up reopens the case for a fresh review; the API also supports an audited correction with a reason. An approved research candidate locks review edits. |
| Verify disease content | Content/Disease Knowledge → inspect claims, evidence and regulatory caveats → verify, request revision or reject. | Only suitable verified guidance is presented as verified farmer advice. |
| Examine sources/library | Review research sources and read the article library. | Admins manage source records and author articles; expert access is review/read oriented. |
| Decide dataset candidate | Content → Dataset Candidates on Android or Dataset Candidates on web → inspect photo, AI prediction, agriculturist result and consent → Approve, Uncertain or Reject with notes. | The assessed case enters the queue automatically. The same agriculturist cannot decide on their own assessment. Approval requires current consent, a determinate completed review and good image quality. |
| Maintain account | Profile photo, name/email, password, language and sign-out. | Staff access stops if verification/session requirements fail. |

## 4. Administrator: records, oversight, and research audit

| Flow | Steps and visible outcome | Interface |
| --- | --- | --- |
| Monitor system | Dashboard metrics: farmers, diagnoses, uncertain scans, pending uploads, review waiting time. | Android and web; web also has Analytics and Model Information. |
| Manage users | List/search farmers and agriculturists; create, edit and delete accounts. | Android Users and web Accounts. Agriculturist accounts are created by an admin. |
| Audit scans | Search/open diagnosis records; see farmer, submitted photo, AI output, source/verification state and separate expert review. Delete a record when authorized. | Android Scans and web Diagnoses. |
| Govern disease records | Edit the four model-class disease records, symptoms, management, evidence and status; submit researched content for independent expert verification or archive it. | Android Knowledge → Diseases; web Disease Knowledge card grid. Unsupported model classes are not added as screening classes. |
| Manage research sources | Add/edit sources and connect evidence to disease claims; inspect regulatory checks for chemical advice. | Android Knowledge → Sources; web Research Sources. |
| Publish articles | Create/edit/archive the article library; upload article photos in either editor. | Android Knowledge → Articles; web Article Library. |
| Decide research candidates | Review the automatic photo grid, filter by status, record independent approval/uncertainty/rejection. | Web Dataset Candidates. Android admin navigation does not expose this page. |
| Audit/remove private copies | Review approved research images and remove a copy with a reason; retry a pending file removal. | Web Dataset Candidates / research photo audit. |
| Compare models | View analytics and submit permitted model comparisons; inspect model information. | Primarily web. These tools do not retrain or replace the Android model. |
| Maintain account | Edit profile/photo/password and sign out. | Android Account and web Profile. |

## 5. Cross-role state rules

1. **Android classification:** photo → 224 × 224 RGB preparation → bundled TensorFlow Lite model → four class scores → local result/history. It does not call the Laravel inference API.
2. **Connected case:** farmer-owned scan/photo → retry-safe synchronization → Laravel diagnosis record. The original AI class and score remain attached to the case.
3. **Human review:** farmer request or prioritized uncertainty → agriculturist claim → structured assessment → farmer notification/history. The assessment is stored separately from the AI prediction.
4. **Follow-up:** farmer reply or clearer photo → same case reopens → fresh assessment. Previous assessment versions remain visible to staff.
5. **Research:** current farmer consent + retained photo + completed expert review → automatic `pending` dataset candidate. An independent staff decision may approve a clear, determinate case and retain a separate private copy. No model retraining occurs in this flow.
6. **Privacy and recovery:** consent can be withdrawn, approved copies can be removed, and failed uploads can be retried. An offline phone can still classify and show local history. Web screening, synchronization, staff tools, chat and account actions need a connection.

## Implementation checked for this map

- Android navigation and role screens: `mobile-frontend/src/app/navigation.ts`, `mobile-frontend/src/app/App.tsx`, `mobile-frontend/src/features/scan/ScanScreen.tsx`, `mobile-frontend/src/features/offline/LocalHistory.tsx`, and connected role workspaces.
- Website navigation and role screens: `web-frontend/src/RoleApp.jsx`.
- API authority and state transitions: `backend/routes/api.php`, `backend/app/Services/ExpertReviewService.php`, `backend/app/Services/DatasetCandidateService.php`, and `backend/app/Services/DiagnosisService.php`.
