<x-public-layout title="Privacy policy">
    <h1>DahonMD privacy policy</h1>
    <p>Effective date: October 7, 2026</p>
    <p>DahonMD helps users document and review banana-leaf observations. This policy describes the data handled by the app and its server.</p>

    <h2>Data we process</h2>
    <ul>
        <li>Account details such as your name and email address.</li>
        <li>Leaf images you choose to capture or upload, classification output, review decisions, and related timestamps.</li>
        <li>Operational data needed for security and reliability, including request identifiers, response status, and authenticated user identifier. Request bodies and passwords are not included in application request logs.</li>
    </ul>

    <h2>How data is used</h2>
    <p>Data is used to provide classification history, synchronize your devices, support agricultural-expert review when requested, secure the service, and improve reliability. A leaf image is not submitted for expert review unless that workflow is requested.</p>
    <p>Signed-in scans may store a private photo on the server for synchronized history and requested agricultural review. The current signup agreement includes research consideration for future account scans; existing accounts keep their current preference. When enabled in your account, future account scans are automatically marked as research-consented; older scans are not added. Some deployments require email verification before scans can be shared. After an agriculturist reviews a consented photo, it enters the dataset candidate queue. If another staff member approves it, the server saves a separate private research copy with its consent version, approval, and removal history. Approval alone does not add the photo to model training. You can turn off future research sharing in your account, which also withdraws consent from existing account scans and removes approved research copies.</p>

    <h2>Storage and deletion</h2>
    <p>Mobile history is stored on your device and synchronized records are stored by the DahonMD server. You can delete individual scans or your account in the app, or use the <a href="/account-deletion">account deletion page</a>. Scan deletion removes its normal server photo, but an approved private research copy remains. While signed in, you can withdraw research consent or remove an approved research copy even after deleting its scan. Account deletion removes the account, synchronized scans, and their normal server photos; you can also choose to remove all approved research copies. If you keep them, their account link is removed. Save the research photo ID shown in your account if you may later request removal through the privacy contact below. Device-only scans remain under your control and can be deleted individually, by clearing app data, or by uninstalling it.</p>

    <h2>Permissions</h2>
    <p>Camera access is used only when you open the scanner. The camera stream is stopped after capture, cancellation, or leaving the scanner. Photo-library access is used only when you choose an existing image.</p>

    <h2>Contact</h2>
    @if ($contactEmail)
        <p>Privacy questions can be sent to <a href="mailto:{{ $contactEmail }}">{{ $contactEmail }}</a>.</p>
    @else
        <p>The deployment operator must configure a privacy contact email before public release.</p>
    @endif
</x-public-layout>
