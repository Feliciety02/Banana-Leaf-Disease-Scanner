<x-public-layout title="Privacy policy">
    <h1>DahonMD privacy policy</h1>
    <p>Last updated: {{ now()->format('F j, Y') }}</p>
    <p>DahonMD helps users document and review banana-leaf observations. This policy describes the data handled by the app and its server.</p>

    <h2>Data we process</h2>
    <ul>
        <li>Account details such as your name and email address.</li>
        <li>Leaf images you choose to capture or upload, diagnosis output, review decisions, and related timestamps.</li>
        <li>Operational data needed for security and reliability, including request identifiers, response status, and authenticated user identifier. Request bodies and passwords are not included in application request logs.</li>
    </ul>

    <h2>How data is used</h2>
    <p>Data is used to provide diagnosis history, synchronize your devices, support agricultural-expert review when requested, secure the service, and improve reliability. A leaf image is not submitted for expert review unless that workflow is requested.</p>

    <h2>Storage and deletion</h2>
    <p>Mobile history is stored on your device and synchronized records are stored by the DahonMD server. You can delete individual history records in the app, delete your signed-in account from the profile screen, or use the <a href="{{ route('account-deletion') }}">account deletion page</a>. Device-only files may also be removed by clearing the app's data or uninstalling it.</p>

    <h2>Permissions</h2>
    <p>Camera access is used only when you open the scanner. The camera stream is stopped after capture, cancellation, or leaving the scanner. Photo-library access is used only when you choose an existing image.</p>

    <h2>Contact</h2>
    @if ($contactEmail)
        <p>Privacy questions can be sent to <a href="mailto:{{ $contactEmail }}">{{ $contactEmail }}</a>.</p>
    @else
        <p>The deployment operator must configure a privacy contact email before public release.</p>
    @endif
</x-public-layout>
