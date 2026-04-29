// Component for converting document IDs to slug-based IDs
import { Stack, Grid, Heading, Text, Button, Select } from '@sanity/ui'
import { LockIcon, UnlockIcon } from '@sanity/icons'
import { useState, useEffect } from 'react'
import DangerModeWarning, { shouldShowDangerWarning } from './DangerModeWarning'

/**
 * Convert IDs to Slug Component
 * Converts document IDs to slug-based IDs for better URL handling
 * @param {Object} props - Component props
 * @param {SanityClient} props.client - Sanity client instance
 */
const ConvertIdsToSlug = ({ icon: Icon, displayName, dangerMode, utilityId, onDangerModeChange, ...props }) => {
	const {client} = props;
	const [typefaces, setTypefaces] = useState([]);
	const [targetTypeface, setTargetTypeface] = useState('');
	const [convertMessage, setConvertMessage] = useState('');
	const [showWarningModal, setShowWarningModal] = useState(false);

	/**
	 * Handle danger mode toggle with warning modal
	 */
	const handleDangerModeToggle = () => {
		if (!dangerMode && shouldShowDangerWarning()) {
			// Trying to enable danger mode, show warning
			setShowWarningModal(true);
		} else {
			// Either disabling danger mode or warning is suppressed
			onDangerModeChange(utilityId, !dangerMode);
		}
	};

	const handleWarningConfirm = () => {
		setShowWarningModal(false);
		onDangerModeChange(utilityId, true);
	};

	const handleWarningCancel = () => {
		setShowWarningModal(false);
	};

	async function getTypefaces(){
		let typefaces = await client.fetch(`*[_type == "typeface" && !(_id in path('drafts.**'))]`);
		setTypefaces(typefaces);
	}

	useEffect(() => {
		getTypefaces();
	}, [])

	async function updateIdsToSlug(){
		console.log(`Scanning ${targetTypeface}`)

		let typeface = await client.fetch(`*[_type == "typeface" && title match "${targetTypeface}*"][0]`);
		let typefaceIds = [];
		typeface.styles.fonts.forEach(font => {
			typefaceIds.push(font._ref);
		});
		console.log('Target Ids:', typefaceIds);

		for await (let [index, id] of typefaceIds.entries()) {
			const rootDoc = await client.fetch(`*[_id == "${id}"][0]`);
			const refDocs = await client.fetch(`*[references("${id}")]`);
			const slug = rootDoc?.slug?.current;

			if (slug) {
				console.log(`[${index}/${typefaceIds.length}] Creating new document: `, slug);
				const newDoc = await client.createOrReplace({ ...rootDoc, _id: slug })
				console.log("New document: ", newDoc);

				for await (let [refIndex, ref] of refDocs.entries()) {
					let refString = JSON.stringify(ref);
					refString = refString.replaceAll(id, slug);
					let refObject = JSON.parse(refString);

					console.log(`[${index}/${typefaceIds.length}][${refIndex}/${refDocs.length}] Updating document: `, ref._id);
					await client
						.patch(ref._id)
						.set(refObject)
						.commit();
				}

				// Delete the old document
				console.log("Deleting old document: ", id);
				await client.delete(id)

				console.log("Updated all instances of ", id, " to ", slug);

			} else {
				console.log('No Slug Found', rootDoc);
			}
		}
	}

	return (
		<>
			<DangerModeWarning
				isOpen={showWarningModal}
				onConfirm={handleWarningConfirm}
				onCancel={handleWarningCancel}
				utilityName="Convert IDs to Slug"
			/>

			<Stack style={{paddingTop: "4em", paddingBottom: "2em", position: "relative"}}>
				<Heading as="h3" size={3}>{Icon && <Icon style={{display: 'inline-block', marginRight: '0.35em', opacity: 0.5, transform: 'translateY(2px)'}} />}{displayName}</Heading>
				<Text muted size={1} style={{paddingTop: "2em", maxWidth: "calc(100% - 100px)"}}>
					Migrate font document IDs from auto-generated IDs to slug-based IDs for cleaner URLs and better content management. Automatically updates all references.
				</Text>
				<Button
					mode={dangerMode?"ghost":"bleed"}
					tone="critical"
					icon={dangerMode?UnlockIcon:LockIcon}
					onClick={handleDangerModeToggle}
					style={{cursor: "pointer", position: "absolute", bottom: "1.5em", right: "0"}}
				/>
			</Stack>

			{dangerMode && (
				<Stack style={{ position: "relative" }} >
					<Select
						style={{
							borderRadius: "3px",
						}}
						onChange={(event) => { setTargetTypeface(event.currentTarget.value) }}
						value={typefaces ? typefaces[0] : ""}
					>
						{typefaces && typefaces.map((typeface, index) => (
							<option key={`typeface-${index}`} value={typeface.title}>{typeface.title}</option>
						))}
					</Select>
					<p style={{opacity: "0.5"}}>Make sure you publish your updates first!<br/><br/></p>
					<Button
						flex={12}
						tone="critical"
						onClick={updateIdsToSlug}
						text={"Convert"}
					/>
				</Stack>
			)}

			{convertMessage !== "" && (
				<Stack>
					<p style={{padding: ".5em 0em 1em", opacity: "0.75"}} dangerouslySetInnerHTML={{__html: convertMessage}}></p>
				</Stack>
			)}
		</>
	)
}

export default ConvertIdsToSlug
